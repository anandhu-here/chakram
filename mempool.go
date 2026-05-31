// mempool.go — In-memory pool of unconfirmed transactions waiting to be mined.
package main

import (
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"
)

const (
	maxMempoolSize = 10_000
	mempoolTxTTL   = 72 * time.Hour
)

// Mempool holds unconfirmed transactions, safe for concurrent access.
type Mempool struct {
	transactions map[string]*Transaction
	addedAt      map[string]time.Time
	mu           sync.RWMutex
	blockchain   *Blockchain
}

// NewMempool creates an empty mempool.
func NewMempool() *Mempool {
	return &Mempool{
		transactions: make(map[string]*Transaction),
		addedAt:      make(map[string]time.Time),
	}
}

// SetBlockchain wires the blockchain into the mempool so that Add() can
// validate that referenced UTXOs exist and signatures are correct.
func (m *Mempool) SetBlockchain(bc *Blockchain) {
	m.blockchain = bc
}

// Add validates tx and inserts it into the mempool.
// Performs structural validation, size check, and UTXO existence + signature
// verification (when a blockchain is wired in via SetBlockchain).
func (m *Mempool) Add(tx *Transaction) error {
	if err := tx.Validate(); err != nil {
		return fmt.Errorf("mempool: invalid transaction: %w", err)
	}
	key := hex.EncodeToString(tx.TxID)

	// Quick checks under read lock.
	m.mu.RLock()
	_, exists := m.transactions[key]
	size := len(m.transactions)
	m.mu.RUnlock()

	if exists {
		return errors.New("mempool: transaction already exists")
	}
	if size >= maxMempoolSize {
		return errors.New("mempool: full")
	}

	// UTXO validation without holding the lock — read-only, potentially slow.
	if m.blockchain != nil && !tx.IsCoinbase {
		height := m.blockchain.GetHeight()
		if err := m.blockchain.UTXOSet.ValidateInputsOnly(tx, height); err != nil {
			return fmt.Errorf("mempool: %w", err)
		}
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	// Evict transactions that have exceeded the TTL before the size check so
	// that a naturally decaying pool never hard-blocks new submissions.
	cutoff := time.Now().Add(-mempoolTxTTL)
	for k, t := range m.addedAt {
		if t.Before(cutoff) {
			delete(m.transactions, k)
			delete(m.addedAt, k)
		}
	}

	// Re-check under write lock to close the TOCTOU window.
	if _, exists := m.transactions[key]; exists {
		return errors.New("mempool: transaction already exists")
	}
	if len(m.transactions) >= maxMempoolSize {
		return errors.New("mempool: full")
	}
	m.transactions[key] = tx
	m.addedAt[key] = time.Now()
	return nil
}

// Remove deletes the transaction with the given TxID from the mempool.
// Called after a block confirms it. No-op if not present.
func (m *Mempool) Remove(txID []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	key := hex.EncodeToString(txID)
	delete(m.transactions, key)
	delete(m.addedAt, key)
}

// Get returns the transaction with the given TxID, or an error if not found.
func (m *Mempool) Get(txID []byte) (*Transaction, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	tx, ok := m.transactions[hex.EncodeToString(txID)]
	if !ok {
		return nil, errors.New("mempool: transaction not found")
	}
	return tx, nil
}

// GetAll returns a snapshot of all transactions as a slice.
// Used by the miner to select transactions for the next block.
func (m *Mempool) GetAll() []*Transaction {
	m.mu.RLock()
	defer m.mu.RUnlock()

	txs := make([]*Transaction, 0, len(m.transactions))
	for _, tx := range m.transactions {
		txs = append(txs, tx)
	}
	return txs
}

// Size returns the number of transactions currently in the mempool.
func (m *Mempool) Size() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.transactions)
}

// ClearConfirmed removes every transaction in txs from the mempool.
// Call this after a new block is added to the chain.
func (m *Mempool) ClearConfirmed(txs []*Transaction) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, tx := range txs {
		key := hex.EncodeToString(tx.TxID)
		delete(m.transactions, key)
		delete(m.addedAt, key)
	}
}
