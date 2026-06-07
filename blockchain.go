// blockchain.go — The Blockchain struct that manages chain state and validation.
// All persistence goes through Storage; this file contains no direct file I/O.
// Every other component in Chakram interacts with the chain through this file.
package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"sync"
)

// ErrOrphanBlock is returned by AddBlock when the block's parent is not yet
// known to this node. The sync layer uses this to request the missing parent.
var ErrOrphanBlock = errors.New("orphan: parent block not found")

// ErrInvalidPoW is returned by AddBlock when the RandomX hash recomputed from
// the block header does not match the hash the block claims to have.
var ErrInvalidPoW = errors.New("invalid block: RandomX PoW hash mismatch")

// Blockchain holds the in-memory chain state and a handle to the storage layer.
type Blockchain struct {
	Storage      *Storage
	UTXOSet      *UTXOSet
	VerifyEngine *RandomXEngine // RandomX engine used to authenticate received blocks
	isSyncing    bool          // true during IBD; skips full RandomX for old blocks
	syncTarget   uint64        // best peer's height when syncing started
	chainMu      sync.Mutex    // serializes all chain state mutations (cs_main equivalent)
	syncMu       sync.RWMutex  // guards isSyncing and syncTarget
	stateMu      sync.RWMutex  // guards Tip and Height — RPC reads never block on mining writes
	Tip          []byte         // hash of the current best (highest) block
	Height       uint64         // height of the current best block
}

// NewBlockchain opens (or resumes) the blockchain stored at dataDir.
// On a fresh database it creates and persists the genesis block automatically.
// On an existing database it loads the chain tip and height from storage.
// Pass createVerifyEngine=true for nodes that verify incoming blocks (seed
// nodes). Mining nodes pass false and call SetVerifyEngine to share the
// mining engine, eliminating the second Argon2d stall at epoch boundaries.
func NewBlockchain(dataDir string, createVerifyEngine bool) (*Blockchain, error) {
	storage, err := NewStorage(dataDir)
	if err != nil {
		return nil, fmt.Errorf("open storage: %w", err)
	}

	var engine *RandomXEngine
	if createVerifyEngine {
		engine = NewRandomXEngine()
	}
	bc := &Blockchain{
		Storage:      storage,
		UTXOSet:      NewUTXOSet(storage),
		VerifyEngine: engine,
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

// SetVerifyEngine wires an existing RandomXEngine into the blockchain for
// PoW verification. Mining nodes call this to share their mining engine so
// only one Argon2d initialisation occurs per epoch instead of two.
func (bc *Blockchain) SetVerifyEngine(engine *RandomXEngine) {
	bc.VerifyEngine = engine
}

// SetSyncing marks the blockchain as in IBD mode.
// peerHeight is the best peer's known chain height (used to keep the last 10
// blocks fully PoW-verified even during IBD). Pass 0 when syncing = false.
func (bc *Blockchain) SetSyncing(syncing bool, peerHeight uint64) {
	bc.syncMu.Lock()
	bc.isSyncing = syncing
	bc.syncTarget = peerHeight
	bc.syncMu.Unlock()
}

// IsSyncing reports whether the node is currently in IBD mode.
func (bc *Blockchain) IsSyncing() bool {
	bc.syncMu.RLock()
	defer bc.syncMu.RUnlock()
	return bc.isSyncing
}

// epochKey returns the RandomX seed for the epoch that contains height.
// Derived purely from the epoch number so every node computes the same key
// for the same height regardless of which blocks are in local storage.
// This eliminates IBD false-positive PoW failures caused by storage fallbacks.
func (bc *Blockchain) epochKey(height uint64) []byte {
	epochNum := height / RandomXEpochLen
	return []byte(fmt.Sprintf("chakram-epoch-%d", epochNum))
}

// blockWork returns the expected number of hashes required for one block at
// the given difficulty: 2^difficulty. Summing this across all blocks gives
// cumulative chainwork — the canonical Bitcoin fork-selection metric.
func blockWork(difficulty uint64) *big.Int {
	return new(big.Int).Lsh(big.NewInt(1), uint(difficulty))
}

// chainWork sums proof-of-work for every block from genesis through b.
// Called only during fork evaluation (rare), so O(height) is acceptable.
// Returns an error if any ancestor is missing — incomplete work must never
// be compared against a complete chain, as it would bias fork selection.
func (bc *Blockchain) chainWork(b *Block) (*big.Int, error) {
	total := blockWork(b.Header.Difficulty)
	cur := b
	for cur.Header.Height > 0 {
		parent, err := bc.Storage.GetBlockByHash(cur.Header.PreviousHash)
		if err != nil {
			return nil, fmt.Errorf("chainwork: missing ancestor %x at height %d: %w",
				cur.Header.PreviousHash, cur.Header.Height-1, err)
		}
		total.Add(total, blockWork(parent.Header.Difficulty))
		cur = parent
	}
	return total, nil
}

// AddBlock validates b and integrates it into the chain.
//
// Accepted cases:
//   1. Direct extension of the current tip → apply to main chain immediately.
//   2. Competing chain with more cumulative chainwork → trigger a reorg.
//   3. Less-work side chain → store by hash for future reference, no tip change.
//
// Returns ErrOrphanBlock when the parent is not yet known; the sync layer uses
// this signal to request the missing ancestor from the peer.
func (bc *Blockchain) AddBlock(b *Block) error {
	bc.chainMu.Lock()
	defer bc.chainMu.Unlock()

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
	if expectedDiff := NextDifficultyFromParent(bc.Storage, b.Header.Height, parent); b.Header.Difficulty != expectedDiff {
		return fmt.Errorf("invalid block: difficulty %d does not match expected %d at height %d",
			b.Header.Difficulty, expectedDiff, b.Header.Height)
	}
	if !b.HashIsValid() {
		return errors.New("invalid block: hash does not meet difficulty target")
	}

	// Checkpoint: a block at a checkpointed height must exactly match the
	// known-good hash committed to by this binary. Rejects any fork that
	// diverges from the canonical history before the checkpoint.
	if expected, ok := Checkpoints[b.Header.Height]; ok {
		if fmt.Sprintf("%x", b.Hash) != expected {
			return fmt.Errorf("block %d rejected: hash conflicts with checkpoint (got %x, want %s)",
				b.Header.Height, b.Hash, expected)
		}
	}
	if b.Header.Timestamp <= parent.Header.Timestamp {
		return fmt.Errorf("invalid block: timestamp %d not after parent timestamp %d",
			b.Header.Timestamp, parent.Header.Timestamp)
	}

	// Validate coinbase structure and IsCoinbase field consistency.
	// A peer can forge any JSON field; we must derive IsCoinbase from structure
	// (no inputs = coinbase) rather than trusting the wire value. A spoofed
	// IsCoinbase would bypass input validation and allow coin duplication.
	if len(b.Transactions) == 0 {
		return errors.New("invalid block: no transactions")
	}
	for i, tx := range b.Transactions {
		expectedCoinbase := len(tx.Inputs) == 0
		if tx.IsCoinbase != expectedCoinbase {
			return fmt.Errorf("invalid block: tx %d IsCoinbase=%v but has %d inputs (must be consistent)",
				i, tx.IsCoinbase, len(tx.Inputs))
		}
		if tx.IsCoinbase && i != 0 {
			return errors.New("invalid block: coinbase must be the first transaction")
		}
	}
	if !b.Transactions[0].IsCoinbase {
		return errors.New("invalid block: first transaction must be coinbase")
	}

	// Re-derive every TxID from canonical content so stored IDs are always
	// authoritative, regardless of what arrived on the wire.
	for _, tx := range b.Transactions {
		tx.TxID = tx.ComputeTxID()
	}

	// Merkle root validation (uses re-derived TxIDs).
	if expectedMerkle := ComputeMerkleRoot(b.Transactions); !bytes.Equal(b.Header.MerkleRoot, expectedMerkle) {
		return errors.New("invalid block: merkle root mismatch")
	}

	// Enforce maximum block size.
	{
		data, err := json.Marshal(blockToJSON(b))
		if err != nil {
			return fmt.Errorf("marshal block for size check: %w", err)
		}
		if uint64(len(data)) > MaxBlockSize {
			return fmt.Errorf("invalid block: serialized size %d bytes exceeds MaxBlockSize %d",
				len(data), MaxBlockSize)
		}
	}

	// Bootstrap time floor: during the first DifficultyWindow blocks the protocol
	// enforces a minimum gap of TargetBlockTime (60s) between blocks. After
	// bootstrap a permanent PostBootstrapMinGap (30s) floor remains in force
	// forever. This prevents any miner from flooding the network with fast blocks
	// that would cause LWMA to overshoot difficulty regardless of window size.
	if b.Header.Height <= DifficultyWindow {
		minTS := parent.Header.Timestamp + TargetBlockTime
		if b.Header.Timestamp < minTS {
			return fmt.Errorf("invalid block: bootstrap time floor violated at h=%d (ts=%d, need>=%d)",
				b.Header.Height, b.Header.Timestamp, minTS)
		}
		fmt.Printf("[BOOTSTRAP] h=%d gap=%ds ✓\n", b.Header.Height, b.Header.Timestamp-parent.Header.Timestamp)
	} else {
		minTS := parent.Header.Timestamp + PostBootstrapMinGap
		if b.Header.Timestamp < minTS {
			return fmt.Errorf("invalid block: minimum block gap violated at h=%d (ts=%d, need>=%d)",
				b.Header.Height, b.Header.Timestamp, minTS)
		}
	}

	// RandomX PoW verification.
	// During IBD we skip the expensive RandomX hash for old blocks — structural
	// checks above (sequential height, difficulty target, timestamps) are
	// sufficient: an attacker would need to redo all PoW to fake a longer chain.
	// We always verify the last 10 blocks approaching the sync target and all
	// new tip blocks, so by the time IBD completes the recent chain is fully
	// authenticated. This matches Bitcoin Core's assumevalid approach.
	if bc.VerifyEngine != nil {
		bc.syncMu.RLock()
		syncing := bc.isSyncing
		target := bc.syncTarget
		bc.syncMu.RUnlock()

		skipPoW := syncing && target > 10 && b.Header.Height+10 < target

		if !skipPoW {
			key := bc.epochKey(b.Header.Height)
			if err := VerifyBlock(b, bc.VerifyEngine, key); err != nil {
				if errors.Is(err, ErrInvalidPoW) {
					return fmt.Errorf("%w (height %d hash %x)", ErrInvalidPoW, b.Header.Height, b.Hash)
				}
				fmt.Printf("[CHAIN] VerifyBlock engine error at h=%d: %v\n", b.Header.Height, err)
				return err
			}
		}
	}

	// Store the block data (by hash only — height index updated separately).
	if err := bc.Storage.SaveBlockData(b); err != nil {
		return fmt.Errorf("save block data: %w", err)
	}

	bc.stateMu.RLock()
	tip := bc.Tip
	height := bc.Height
	bc.stateMu.RUnlock()

	switch {
	case bytes.Equal(b.Header.PreviousHash, tip):
		// Fast path: direct extension of the main chain.
		return bc.applyBlock(b)

	case b.Header.Height >= height:
		// Candidate chain: same height or taller. Compare cumulative chainwork.
		// Strictly greater work always wins (Bitcoin rule).
		// Equal work: prefer the block whose hash is lexicographically lower —
		// both nodes see the same two hashes and make the identical decision,
		// so the tie resolves deterministically without ping-pong reorgs.
		currentTip, err := bc.Storage.GetBlockByHash(tip)
		if err != nil {
			return fmt.Errorf("fetch current tip for chainwork comparison: %w", err)
		}
		newWork, err := bc.chainWork(b)
		if err != nil {
			return fmt.Errorf("chainwork for candidate: %w", err)
		}
		curWork, err := bc.chainWork(currentTip)
		if err != nil {
			return fmt.Errorf("chainwork for current tip: %w", err)
		}
		cmp := newWork.Cmp(curWork)
		if cmp > 0 {
			return bc.reorganize(b)
		}
		if cmp == 0 && bytes.Compare(b.Hash[:], currentTip.Hash[:]) < 0 {
			return bc.reorganize(b)
		}
		return nil

	default:
		// Shorter, less-work side chain — stored for completeness, no tip change.
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
	for _, tx := range b.Transactions {
		if err := bc.Storage.SaveTxIndex(tx.TxID, b.Header.Height); err != nil {
			return fmt.Errorf("save tx index: %w", err)
		}
	}
	if err := bc.Storage.SaveChainTip(b.Hash, b.Header.Height); err != nil {
		return fmt.Errorf("save chain tip: %w", err)
	}
	bc.stateMu.Lock()
	bc.Tip = b.Hash
	bc.Height = b.Header.Height
	bc.stateMu.Unlock()
	return nil
}

// reorganize switches the main chain from the current tip to newTip.
// Steps:
//  1. Walk back from both tips to their common ancestor.
//  2. Roll back the old chain (tip → ancestor+1) using stored undo data.
//  3. Apply the new chain (ancestor+1 → newTip) in order.
func (bc *Blockchain) reorganize(newTip *Block) error {
	oldTip, err := bc.Storage.GetBlockByHash(bc.GetTip())
	if err != nil {
		return fmt.Errorf("fetch current tip: %w", err)
	}

	ancestor, rollback, apply, err := bc.findReorgPath(oldTip, newTip)
	if err != nil {
		return fmt.Errorf("find reorg path: %w", err)
	}

	// Never roll back past the highest checkpoint — that history is immutable.
	if cp := highestCheckpoint(); cp > 0 && ancestor.Header.Height < cp {
		return fmt.Errorf("reorganize rejected: common ancestor at height %d is below checkpoint at height %d",
			ancestor.Header.Height, cp)
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
		for _, tx := range b.Transactions {
			bc.Storage.DeleteTxIndex(tx.TxID) //nolint:errcheck — best-effort on rollback
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
		for _, tx := range b.Transactions {
			if err := bc.Storage.SaveTxIndex(tx.TxID, b.Header.Height); err != nil {
				return fmt.Errorf("save tx index for %x: %w", b.Hash, err)
			}
		}
	}

	if err := bc.Storage.SaveChainTip(newTip.Hash, newTip.Header.Height); err != nil {
		return fmt.Errorf("save chain tip: %w", err)
	}
	bc.stateMu.Lock()
	bc.Tip = newTip.Hash
	bc.Height = newTip.Header.Height
	bc.stateMu.Unlock()

	fmt.Printf("⛓  Reorg complete — new tip %x at height %d\n", newTip.Hash, newTip.Header.Height)
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
	b, err := bc.Storage.GetBlockByHash(bc.GetTip())
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
// linkage, proof-of-work, sequential height, timestamp ordering, difficulty,
// Merkle root integrity, and coinbase structure.
func (bc *Blockchain) IsValid() (bool, error) {
	for h := uint64(1); h <= bc.GetHeight(); h++ {
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
		if expectedDiff := NextDifficultyFromParent(bc.Storage, h, prev); block.Header.Difficulty != expectedDiff {
			return false, fmt.Errorf("height %d: difficulty %d != expected %d",
				h, block.Header.Difficulty, expectedDiff)
		}
		if expectedMerkle := ComputeMerkleRoot(block.Transactions); !bytes.Equal(block.Header.MerkleRoot, expectedMerkle) {
			return false, fmt.Errorf("height %d: merkle root mismatch", h)
		}
		if len(block.Transactions) == 0 {
			return false, fmt.Errorf("height %d: no transactions", h)
		}
		for i, tx := range block.Transactions {
			if tx.IsCoinbase != (len(tx.Inputs) == 0) {
				return false, fmt.Errorf("height %d: tx %d IsCoinbase inconsistent with inputs", h, i)
			}
			if tx.IsCoinbase && i != 0 {
				return false, fmt.Errorf("height %d: coinbase at position %d (must be 0)", h, i)
			}
		}
		if !block.Transactions[0].IsCoinbase {
			return false, fmt.Errorf("height %d: first transaction is not coinbase", h)
		}
	}
	return true, nil
}

// GetHeight returns the current best chain height.
// Safe for concurrent use — RPC handlers call this without blocking the miner.
func (bc *Blockchain) GetHeight() uint64 {
	bc.stateMu.RLock()
	defer bc.stateMu.RUnlock()
	return bc.Height
}

// GetTip returns a copy of the current best block hash.
// Safe for concurrent use — RPC handlers call this without blocking the miner.
func (bc *Blockchain) GetTip() []byte {
	bc.stateMu.RLock()
	defer bc.stateMu.RUnlock()
	return append([]byte{}, bc.Tip...)
}

// HasBlock reports whether the block with the given hash is stored (any chain).
func (bc *Blockchain) HasBlock(hash []byte) bool {
	return bc.Storage.HasBlock(hash)
}
