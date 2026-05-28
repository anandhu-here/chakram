// blockchain.go — The Blockchain struct that manages chain state and validation.
// All persistence goes through Storage; this file contains no direct file I/O.
// Every other component in Chakram interacts with the chain through this file.
package main

import (
	"bytes"
	"errors"
	"fmt"
)

// ErrOrphanBlock is returned by AddBlock when the block's parent is not yet
// known to this node. The sync layer uses this to request the missing parent.
var ErrOrphanBlock = errors.New("orphan: parent block not found")

// Blockchain holds the in-memory chain state and a handle to the storage layer.
type Blockchain struct {
	Storage *Storage
	UTXOSet *UTXOSet
	Tip     []byte // hash of the current best (highest) block
	Height  uint64 // height of the current best block
}

// NewBlockchain opens (or resumes) the blockchain stored at dataDir.
// On a fresh database it creates and persists the genesis block automatically.
// On an existing database it loads the chain tip and height from storage.
func NewBlockchain(dataDir string) (*Blockchain, error) {
	storage, err := NewStorage(dataDir)
	if err != nil {
		return nil, fmt.Errorf("open storage: %w", err)
	}

	bc := &Blockchain{
		Storage: storage,
		UTXOSet: NewUTXOSet(storage),
	}

	tip, height, err := storage.GetChainTip()
	if err == nil {
		bc.Tip = tip
		bc.Height = height
		return bc, nil
	}

	// Fresh database — bootstrap with the genesis block.
	genesis := NewGenesisBlock()
	if err := storage.SaveBlock(genesis); err != nil {
		storage.Close()
		return nil, fmt.Errorf("save genesis block: %w", err)
	}
	if err := storage.SaveChainTip(genesis.Hash, genesis.Header.Height); err != nil {
		storage.Close()
		return nil, fmt.Errorf("save genesis tip: %w", err)
	}
	bc.Tip = genesis.Hash
	bc.Height = genesis.Header.Height
	return bc, nil
}

// Close cleanly shuts down the storage layer.
// Always defer this after a successful NewBlockchain call.
func (bc *Blockchain) Close() error {
	return bc.Storage.Close()
}

// AddBlock validates b and integrates it into the chain.
//
// Accepted cases:
//   1. Direct extension of the current tip → apply to main chain immediately.
//   2. Longer competing chain (height > bc.Height) → trigger a reorg.
//   3. Shorter side chain → store by hash for future reference, no tip change.
//
// Returns ErrOrphanBlock when the parent is not yet known; the sync layer uses
// this signal to request the missing ancestor from the peer.
func (bc *Blockchain) AddBlock(b *Block) error {
	// Genesis blocks are immutable.
	if b.Header.Height == 0 {
		return errors.New("cannot replace genesis block")
	}

	// Deduplicate — already have this exact block.
	if bc.Storage.HasBlock(b.Hash) {
		return nil
	}

	// Locate parent; an unknown parent means this is an orphan.
	parent, err := bc.Storage.GetBlockByHash(b.Header.PreviousHash)
	if err != nil {
		return fmt.Errorf("%w (hash %x)", ErrOrphanBlock, b.Header.PreviousHash)
	}

	// Structural validity.
	if b.Header.Height != parent.Header.Height+1 {
		return fmt.Errorf("invalid block: expected height %d, got %d",
			parent.Header.Height+1, b.Header.Height)
	}
	if !b.HashIsValid() {
		return errors.New("invalid block: hash does not meet difficulty target")
	}
	if b.Header.Timestamp <= parent.Header.Timestamp {
		return fmt.Errorf("invalid block: timestamp %d not after parent timestamp %d",
			b.Header.Timestamp, parent.Header.Timestamp)
	}

	// Store the block data (by hash only — height index updated separately).
	if err := bc.Storage.SaveBlockData(b); err != nil {
		return fmt.Errorf("save block data: %w", err)
	}

	switch {
	case bytes.Equal(b.Header.PreviousHash, bc.Tip):
		// Fast path: direct extension of the main chain.
		return bc.applyBlock(b)

	case b.Header.Height > bc.Height:
		// Longer fork — reorganise to this chain.
		return bc.reorganize(b)

	default:
		// Shorter side chain — stored for completeness, no tip change.
		return nil
	}
}

// applyBlock extends the main chain by one block: processes UTXOs, updates the
// height index, saves undo data, and advances bc.Tip / bc.Height.
func (bc *Blockchain) applyBlock(b *Block) error {
	undo, err := bc.UTXOSet.ProcessBlock(b, b.Header.Height)
	if err != nil {
		return fmt.Errorf("process utxo set: %w", err)
	}
	if err := bc.Storage.UpdateHeightIndex(b); err != nil {
		return fmt.Errorf("update height index: %w", err)
	}
	if err := bc.Storage.SaveBlockUndo(b.Hash, undo); err != nil {
		return fmt.Errorf("save block undo: %w", err)
	}
	if err := bc.Storage.SaveChainTip(b.Hash, b.Header.Height); err != nil {
		return fmt.Errorf("save chain tip: %w", err)
	}
	bc.Tip = b.Hash
	bc.Height = b.Header.Height
	return nil
}

// reorganize switches the main chain from the current tip to newTip.
// Steps:
//  1. Walk back from both tips to their common ancestor.
//  2. Roll back the old chain (tip → ancestor+1) using stored undo data.
//  3. Apply the new chain (ancestor+1 → newTip) in order.
func (bc *Blockchain) reorganize(newTip *Block) error {
	oldTip, err := bc.Storage.GetBlockByHash(bc.Tip)
	if err != nil {
		return fmt.Errorf("fetch current tip: %w", err)
	}

	ancestor, rollback, apply, err := bc.findReorgPath(oldTip, newTip)
	if err != nil {
		return fmt.Errorf("find reorg path: %w", err)
	}

	fmt.Printf("⛓  Reorg: common ancestor at height %d, rolling back %d, applying %d\n",
		ancestor.Header.Height, len(rollback), len(apply))

	// Roll back old chain from tip to ancestor+1.
	for _, b := range rollback {
		undo, err := bc.Storage.GetBlockUndo(b.Hash)
		if err != nil {
			return fmt.Errorf("get undo for %x: %w", b.Hash, err)
		}
		if err := bc.UTXOSet.RollbackBlock(undo); err != nil {
			return fmt.Errorf("rollback block %x: %w", b.Hash, err)
		}
	}

	// Apply new chain from ancestor+1 to newTip.
	for _, b := range apply {
		undo, err := bc.UTXOSet.ProcessBlock(b, b.Header.Height)
		if err != nil {
			return fmt.Errorf("apply block %x: %w", b.Hash, err)
		}
		if err := bc.Storage.UpdateHeightIndex(b); err != nil {
			return fmt.Errorf("update height index for %x: %w", b.Hash, err)
		}
		if err := bc.Storage.SaveBlockUndo(b.Hash, undo); err != nil {
			return fmt.Errorf("save undo for %x: %w", b.Hash, err)
		}
	}

	if err := bc.Storage.SaveChainTip(newTip.Hash, newTip.Header.Height); err != nil {
		return fmt.Errorf("save chain tip: %w", err)
	}
	bc.Tip = newTip.Hash
	bc.Height = newTip.Header.Height

	fmt.Printf("⛓  Reorg complete — new tip %x at height %d\n", bc.Tip, bc.Height)
	return nil
}

// findReorgPath walks back from oldTip and newTip simultaneously until they
// share a common ancestor. Returns:
//   - ancestor: the shared block
//   - rollback: old-chain blocks ordered tip→ancestor+1 (highest first)
//   - apply:    new-chain blocks ordered ancestor+1→newTip (lowest first)
func (bc *Blockchain) findReorgPath(oldTip, newTip *Block) (ancestor *Block, rollback, apply []*Block, err error) {
	old := oldTip
	new_ := newTip

	for !bytes.Equal(old.Hash, new_.Hash) {
		if old.Header.Height > new_.Header.Height {
			rollback = append(rollback, old)
			old, err = bc.Storage.GetBlockByHash(old.Header.PreviousHash)
			if err != nil {
				return nil, nil, nil, fmt.Errorf("walk old chain: %w", err)
			}
		} else if new_.Header.Height > old.Header.Height {
			apply = append([]*Block{new_}, apply...)
			new_, err = bc.Storage.GetBlockByHash(new_.Header.PreviousHash)
			if err != nil {
				return nil, nil, nil, fmt.Errorf("walk new chain: %w", err)
			}
		} else {
			// Same height, different blocks — step both back.
			rollback = append(rollback, old)
			apply = append([]*Block{new_}, apply...)
			old, err = bc.Storage.GetBlockByHash(old.Header.PreviousHash)
			if err != nil {
				return nil, nil, nil, fmt.Errorf("walk old chain: %w", err)
			}
			new_, err = bc.Storage.GetBlockByHash(new_.Header.PreviousHash)
			if err != nil {
				return nil, nil, nil, fmt.Errorf("walk new chain: %w", err)
			}
		}
	}
	return old, rollback, apply, nil
}

// GetLastBlock returns the block at the current chain tip.
func (bc *Blockchain) GetLastBlock() (*Block, error) {
	b, err := bc.Storage.GetBlockByHash(bc.Tip)
	if err != nil {
		return nil, fmt.Errorf("get tip block: %w", err)
	}
	return b, nil
}

// GetBlock returns the block at the given height on the main chain.
func (bc *Blockchain) GetBlock(height uint64) (*Block, error) {
	b, err := bc.Storage.GetBlockByHeight(height)
	if err != nil {
		return nil, fmt.Errorf("get block at height %d: %w", height, err)
	}
	return b, nil
}

// IsValid walks the entire main chain from height 1 to bc.Height and verifies
// linkage, proof-of-work, sequential height, and timestamp ordering.
func (bc *Blockchain) IsValid() (bool, error) {
	for h := uint64(1); h <= bc.Height; h++ {
		block, err := bc.GetBlock(h)
		if err != nil {
			return false, fmt.Errorf("height %d: %w", h, err)
		}
		prev, err := bc.GetBlock(h - 1)
		if err != nil {
			return false, fmt.Errorf("height %d: fetch previous block: %w", h, err)
		}
		if !bytes.Equal(block.Header.PreviousHash, prev.Hash) {
			return false, fmt.Errorf("height %d: PreviousHash mismatch", h)
		}
		if !block.HashIsValid() {
			return false, fmt.Errorf("height %d: hash does not meet difficulty target", h)
		}
		if block.Header.Height != h {
			return false, fmt.Errorf("height %d: stored height field is %d", h, block.Header.Height)
		}
		if block.Header.Timestamp <= prev.Header.Timestamp {
			return false, fmt.Errorf("height %d: timestamp not after previous block", h)
		}
	}
	return true, nil
}

// GetHeight returns the current best chain height.
func (bc *Blockchain) GetHeight() uint64 {
	return bc.Height
}

// HasBlock reports whether the block with the given hash is stored (any chain).
func (bc *Blockchain) HasBlock(hash []byte) bool {
	return bc.Storage.HasBlock(hash)
}
