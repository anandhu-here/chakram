// blockchain.go — The Blockchain struct that manages chain state and validation.
// All persistence goes through Storage; this file contains no direct file I/O.
// Every other component in Chakram interacts with the chain through this file.
package main

import (
	"bytes"
	"errors"
	"fmt"
)

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
		// Existing chain — restore in-memory state from storage.
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

// AddBlock validates b and, if valid, appends it to the chain.
// Validation rules (in order):
//  1. PreviousHash must match the current tip block's hash.
//  2. Height must be exactly tip height + 1.
//  3. The block hash must satisfy the proof-of-work target.
//  4. Timestamp must be strictly greater than the previous block's timestamp.
func (bc *Blockchain) AddBlock(b *Block) error {
	last, err := bc.GetLastBlock()
	if err != nil {
		return fmt.Errorf("fetch last block: %w", err)
	}

	if !bytes.Equal(b.Header.PreviousHash, last.Hash) {
		return errors.New("invalid block: PreviousHash does not match current tip")
	}
	if b.Header.Height != last.Header.Height+1 {
		return fmt.Errorf("invalid block: expected height %d, got %d",
			last.Header.Height+1, b.Header.Height)
	}
	if !b.HashIsValid() {
		return errors.New("invalid block: hash does not meet difficulty target")
	}
	if b.Header.Timestamp <= last.Header.Timestamp {
		return fmt.Errorf("invalid block: timestamp %d is not after previous block timestamp %d",
			b.Header.Timestamp, last.Header.Timestamp)
	}

	if err := bc.Storage.SaveBlock(b); err != nil {
		return fmt.Errorf("save block: %w", err)
	}
	if err := bc.Storage.SaveChainTip(b.Hash, b.Header.Height); err != nil {
		return fmt.Errorf("save chain tip: %w", err)
	}
	if err := bc.UTXOSet.ProcessBlock(b, b.Header.Height); err != nil {
		return fmt.Errorf("process utxo set: %w", err)
	}
	bc.Tip = b.Hash
	bc.Height = b.Header.Height
	return nil
}

// GetLastBlock returns the block at the current chain tip.
func (bc *Blockchain) GetLastBlock() (*Block, error) {
	b, err := bc.Storage.GetBlockByHash(bc.Tip)
	if err != nil {
		return nil, fmt.Errorf("get tip block: %w", err)
	}
	return b, nil
}

// GetBlock returns the block at the given height.
func (bc *Blockchain) GetBlock(height uint64) (*Block, error) {
	b, err := bc.Storage.GetBlockByHeight(height)
	if err != nil {
		return nil, fmt.Errorf("get block at height %d: %w", height, err)
	}
	return b, nil
}

// IsValid walks the entire chain from height 1 to bc.Height and verifies
// each block's linkage, proof-of-work, sequential height, and timestamp order.
// Returns (false, descriptive error) on the first violation found.
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
			return false, fmt.Errorf("height %d: PreviousHash does not match block %d hash", h, h-1)
		}
		if !block.HashIsValid() {
			return false, fmt.Errorf("height %d: hash does not meet difficulty target", h)
		}
		if block.Header.Height != h {
			return false, fmt.Errorf("height %d: stored height field is %d", h, block.Header.Height)
		}
		if block.Header.Timestamp <= prev.Header.Timestamp {
			return false, fmt.Errorf("height %d: timestamp %d not after previous block timestamp %d",
				h, block.Header.Timestamp, prev.Header.Timestamp)
		}
	}
	return true, nil
}

// GetHeight returns the current best chain height.
func (bc *Blockchain) GetHeight() uint64 {
	return bc.Height
}

// HasBlock reports whether the block with the given hash is already in the chain.
func (bc *Blockchain) HasBlock(hash []byte) bool {
	return bc.Storage.HasBlock(hash)
}
