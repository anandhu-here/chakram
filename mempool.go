// mempool.go — In-memory pool of unconfirmed transactions waiting to be mined.
package main

import (
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
)

// Mempool holds unconfirmed transactions, safe for concurrent access.
type Mempool struct {
	transactions map[string]*Transaction
	mu           sync.RWMutex
}

// NewMempool creates an empty mempool.
func NewMempool() *Mempool {
	return &Mempool{
		transactions: make(map[string]*Transaction),
	}
}

// Add validates tx and inserts it into the mempool.
// Returns an error if the transaction fails structural validation or is a duplicate.
func (m *Mempool) Add(tx *Transaction) error {
	if err := tx.Validate(); err != nil {
		return fmt.Errorf("mempool: invalid transaction: %w", err)
	}
	key := hex.EncodeToString(tx.TxID)

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, exists := m.transactions[key]; exists {
		return errors.New("mempool: transaction already exists")
	}
	m.transactions[key] = tx
	return nil
}

// Remove deletes the transaction with the given TxID from the mempool.
// Called after a block confirms it. No-op if not present.
func (m *Mempool) Remove(txID []byte) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.transactions, hex.EncodeToString(txID))
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
		delete(m.transactions, hex.EncodeToString(tx.TxID))
	}
}
