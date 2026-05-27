// storage.go — The entire storage layer for the Chakram blockchain.
// All reads and writes to BadgerDB go through this file.
// Nothing else in the codebase should import or touch BadgerDB directly.
package main

import (
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"

	badger "github.com/dgraph-io/badger/v4"
)

// ── Key scheme ────────────────────────────────────────────────────────────────
//
//  block:hash:<hex-hash>          — full block JSON, keyed by 32-byte hash
//  block:height:<8-byte-BE-uint>  — 32-byte hash of block at that height
//  meta:tip                       — 32-byte hash of the current chain tip
//  meta:height                    — 8-byte big-endian current chain height
//  utxo:<txid>:<index>            — reserved for Phase 3 UTXO set

var (
	keyMetaTip    = []byte("meta:tip")
	keyMetaHeight = []byte("meta:height")
)

func blockHashKey(hash []byte) []byte {
	return []byte("block:hash:" + hex.EncodeToString(hash))
}

func blockHeightKey(height uint64) []byte {
	var buf [8]byte
	binary.BigEndian.PutUint64(buf[:], height)
	return append([]byte("block:height:"), buf[:]...)
}

// ── Storage-local DTOs ────────────────────────────────────────────────────────
// We convert []byte fields to hex strings so stored JSON is human-readable.

type txJSON struct {
	TxID string `json:"txid"`
}

type headerJSON struct {
	Version      uint32 `json:"version"`
	Height       uint64 `json:"height"`
	PreviousHash string `json:"previous_hash"`
	MerkleRoot   string `json:"merkle_root"`
	Timestamp    int64  `json:"timestamp"`
	Difficulty   uint64 `json:"difficulty"`
	Nonce        uint64 `json:"nonce"`
}

type blockJSON struct {
	Header       headerJSON `json:"header"`
	Transactions []txJSON   `json:"transactions"`
	Hash         string     `json:"hash"`
}

func blockToJSON(b *Block) blockJSON {
	txs := make([]txJSON, len(b.Transactions))
	for i, tx := range b.Transactions {
		txs[i] = txJSON{TxID: hex.EncodeToString(tx.TxID)}
	}
	return blockJSON{
		Header: headerJSON{
			Version:      b.Header.Version,
			Height:       b.Header.Height,
			PreviousHash: hex.EncodeToString(b.Header.PreviousHash),
			MerkleRoot:   hex.EncodeToString(b.Header.MerkleRoot),
			Timestamp:    b.Header.Timestamp,
			Difficulty:   b.Header.Difficulty,
			Nonce:        b.Header.Nonce,
		},
		Transactions: txs,
		Hash:         hex.EncodeToString(b.Hash),
	}
}

func blockFromJSON(bj blockJSON) (*Block, error) {
	prevHash, err := hex.DecodeString(bj.Header.PreviousHash)
	if err != nil {
		return nil, fmt.Errorf("decode previous_hash: %w", err)
	}
	merkle, err := hex.DecodeString(bj.Header.MerkleRoot)
	if err != nil {
		return nil, fmt.Errorf("decode merkle_root: %w", err)
	}
	hash, err := hex.DecodeString(bj.Hash)
	if err != nil {
		return nil, fmt.Errorf("decode hash: %w", err)
	}

	txs := make([]*Transaction, len(bj.Transactions))
	for i, t := range bj.Transactions {
		txID, err := hex.DecodeString(t.TxID)
		if err != nil {
			return nil, fmt.Errorf("decode txid[%d]: %w", i, err)
		}
		txs[i] = &Transaction{TxID: txID}
	}

	return &Block{
		Header: BlockHeader{
			Version:      bj.Header.Version,
			Height:       bj.Header.Height,
			PreviousHash: prevHash,
			MerkleRoot:   merkle,
			Timestamp:    bj.Header.Timestamp,
			Difficulty:   bj.Header.Difficulty,
			Nonce:        bj.Header.Nonce,
		},
		Transactions: txs,
		Hash:         hash,
	}, nil
}

// ── Storage ───────────────────────────────────────────────────────────────────

// Storage is the single access point for all on-disk blockchain data.
type Storage struct {
	DB *badger.DB
}

// NewStorage opens (or creates) a BadgerDB database at the given directory path.
// The caller is responsible for calling Close when done.
func NewStorage(path string) (*Storage, error) {
	opts := badger.DefaultOptions(path).WithLogger(nil)
	db, err := badger.Open(opts)
	if err != nil {
		return nil, fmt.Errorf("open badger at %s: %w", path, err)
	}
	return &Storage{DB: db}, nil
}

// Close flushes pending writes and cleanly shuts down the BadgerDB instance.
// Always defer this after a successful NewStorage call.
func (s *Storage) Close() error {
	return s.DB.Close()
}

// SaveBlock serialises b to JSON and persists it under two keys:
//   - "block:hash:<hash>"      — the full block data
//   - "block:height:<height>"  — the hash, for height-based lookups
func (s *Storage) SaveBlock(b *Block) error {
	data, err := json.Marshal(blockToJSON(b))
	if err != nil {
		return fmt.Errorf("marshal block: %w", err)
	}

	return s.DB.Update(func(txn *badger.Txn) error {
		if err := txn.Set(blockHashKey(b.Hash), data); err != nil {
			return err
		}
		return txn.Set(blockHeightKey(b.Header.Height), b.Hash)
	})
}

// GetBlockByHash retrieves and deserialises the block stored under the given hash.
// Returns badger.ErrKeyNotFound (wrapped) if no such block exists.
func (s *Storage) GetBlockByHash(hash []byte) (*Block, error) {
	var b *Block
	err := s.DB.View(func(txn *badger.Txn) error {
		item, err := txn.Get(blockHashKey(hash))
		if err != nil {
			return err
		}
		return item.Value(func(val []byte) error {
			var bj blockJSON
			if err := json.Unmarshal(val, &bj); err != nil {
				return err
			}
			b, err = blockFromJSON(bj)
			return err
		})
	})
	if err != nil {
		return nil, fmt.Errorf("get block by hash: %w", err)
	}
	return b, nil
}

// GetBlockByHeight looks up the hash stored at the given height, then fetches
// the full block by that hash.
func (s *Storage) GetBlockByHeight(height uint64) (*Block, error) {
	var hash []byte
	err := s.DB.View(func(txn *badger.Txn) error {
		item, err := txn.Get(blockHeightKey(height))
		if err != nil {
			return err
		}
		return item.Value(func(val []byte) error {
			hash = make([]byte, len(val))
			copy(hash, val)
			return nil
		})
	})
	if err != nil {
		return nil, fmt.Errorf("get hash at height %d: %w", height, err)
	}
	return s.GetBlockByHash(hash)
}

// SaveChainTip atomically persists the current tip hash and chain height.
// Both values are written in a single BadgerDB transaction so they stay consistent.
func (s *Storage) SaveChainTip(hash []byte, height uint64) error {
	var heightBuf [8]byte
	binary.BigEndian.PutUint64(heightBuf[:], height)

	return s.DB.Update(func(txn *badger.Txn) error {
		if err := txn.Set(keyMetaTip, hash); err != nil {
			return err
		}
		return txn.Set(keyMetaHeight, heightBuf[:])
	})
}

// GetChainTip returns the hash and height of the current best chain tip.
// Returns an error if the tip has not been initialised yet (fresh database).
func (s *Storage) GetChainTip() (hash []byte, height uint64, err error) {
	err = s.DB.View(func(txn *badger.Txn) error {
		// tip hash
		item, err := txn.Get(keyMetaTip)
		if err != nil {
			return fmt.Errorf("meta:tip not found: %w", err)
		}
		if err = item.Value(func(val []byte) error {
			hash = make([]byte, len(val))
			copy(hash, val)
			return nil
		}); err != nil {
			return err
		}

		// tip height
		item, err = txn.Get(keyMetaHeight)
		if err != nil {
			return fmt.Errorf("meta:height not found: %w", err)
		}
		return item.Value(func(val []byte) error {
			if len(val) < 8 {
				return fmt.Errorf("meta:height value too short")
			}
			height = binary.BigEndian.Uint64(val)
			return nil
		})
	})
	return hash, height, err
}

// HasBlock reports whether a block with the given hash is already stored.
// Used by the network layer to skip duplicate block processing.
func (s *Storage) HasBlock(hash []byte) bool {
	err := s.DB.View(func(txn *badger.Txn) error {
		_, err := txn.Get(blockHashKey(hash))
		return err
	})
	return err == nil
}

// ── UTXO storage ─────────────────────────────────────────────────────────────

// SaveUTXO stores raw UTXO bytes under the given key.
func (s *Storage) SaveUTXO(key string, data []byte) error {
	return s.DB.Update(func(txn *badger.Txn) error {
		return txn.Set([]byte(key), data)
	})
}

// DeleteUTXO removes the entry at key. Returns an error if the key does not
// exist — a missing UTXO on spend is a double-spend attempt.
func (s *Storage) DeleteUTXO(key string) error {
	return s.DB.Update(func(txn *badger.Txn) error {
		if _, err := txn.Get([]byte(key)); err != nil {
			return fmt.Errorf("utxo not found: %w", err)
		}
		return txn.Delete([]byte(key))
	})
}

// GetUTXO returns the raw bytes stored at key, or an error if not found.
func (s *Storage) GetUTXO(key string) ([]byte, error) {
	var data []byte
	err := s.DB.View(func(txn *badger.Txn) error {
		item, err := txn.Get([]byte(key))
		if err != nil {
			return err
		}
		return item.Value(func(val []byte) error {
			data = make([]byte, len(val))
			copy(data, val)
			return nil
		})
	})
	if err != nil {
		return nil, fmt.Errorf("get utxo %s: %w", key, err)
	}
	return data, nil
}

// IteratePrefix calls fn for every key-value pair whose key starts with prefix.
// Used by UTXOSet.GetUTXOsForAddress to scan the full UTXO set for an owner.
func (s *Storage) IteratePrefix(prefix string, fn func(key, value []byte) error) error {
	return s.DB.View(func(txn *badger.Txn) error {
		opts := badger.DefaultIteratorOptions
		opts.Prefix = []byte(prefix)
		it := txn.NewIterator(opts)
		defer it.Close()

		pfx := []byte(prefix)
		for it.Seek(pfx); it.ValidForPrefix(pfx); it.Next() {
			item := it.Item()
			key := item.KeyCopy(nil)
			if err := item.Value(func(val []byte) error {
				return fn(key, val)
			}); err != nil {
				return err
			}
		}
		return nil
	})
}
