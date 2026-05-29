// utxo.go — UTXO set: tracks all unspent transaction outputs on the Chakram chain.
// The UTXO set is the single source of truth for wallet balances and
// double-spend prevention. All reads/writes go through Storage.
package main

import (
	"bytes"
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"fmt"
)

// ── Types ─────────────────────────────────────────────────────────────────────

// UTXO represents a single unspent transaction output.
type UTXO struct {
	TxID          []byte
	OutputIndex   uint32
	Value         uint64 // in Cash
	PublicKeyHash []byte // 20 bytes: RIPEMD160(SHA256(ownerPublicKey))
	BlockHeight   uint64
	IsCoinbase    bool
}

// UTXORef identifies a UTXO by its location without carrying its full data.
type UTXORef struct {
	TxID        []byte
	OutputIndex uint32
}

// BlockUndo contains the data needed to undo the UTXO changes made by one block.
// SpentUTXOs are restored on rollback; CreatedRefs are deleted.
type BlockUndo struct {
	SpentUTXOs  []UTXO    // UTXOs consumed by this block (restore on rollback)
	CreatedRefs []UTXORef // UTXOs created by this block (delete on rollback)
}

// UTXOSet manages the full set of unspent outputs backed by Storage.
type UTXOSet struct {
	Storage *Storage
}

// NewUTXOSet creates a UTXOSet backed by the given storage instance.
func NewUTXOSet(storage *Storage) *UTXOSet {
	return &UTXOSet{Storage: storage}
}

// ── Storage-local DTO ─────────────────────────────────────────────────────────

type utxoJSON struct {
	TxID        string `json:"txid"`
	OutputIndex uint32 `json:"output_index"`
	Value       uint64 `json:"value"`
	PubKeyHash  string `json:"pub_key_hash"`
	BlockHeight uint64 `json:"block_height"`
	IsCoinbase  bool   `json:"is_coinbase"`
}

func utxoToJSON(u UTXO) utxoJSON {
	return utxoJSON{
		TxID:        hex.EncodeToString(u.TxID),
		OutputIndex: u.OutputIndex,
		Value:       u.Value,
		PubKeyHash:  hex.EncodeToString(u.PublicKeyHash),
		BlockHeight: u.BlockHeight,
		IsCoinbase:  u.IsCoinbase,
	}
}

func utxoFromJSON(j utxoJSON) (UTXO, error) {
	txID, err := hex.DecodeString(j.TxID)
	if err != nil {
		return UTXO{}, fmt.Errorf("decode txid: %w", err)
	}
	pkh, err := hex.DecodeString(j.PubKeyHash)
	if err != nil {
		return UTXO{}, fmt.Errorf("decode pub_key_hash: %w", err)
	}
	return UTXO{
		TxID:        txID,
		OutputIndex: j.OutputIndex,
		Value:       j.Value,
		PublicKeyHash: pkh,
		BlockHeight: j.BlockHeight,
		IsCoinbase:  j.IsCoinbase,
	}, nil
}

func utxoKey(txID []byte, outputIndex uint32) string {
	return fmt.Sprintf("utxo:%s:%d", hex.EncodeToString(txID), outputIndex)
}

// ── UTXO operations ───────────────────────────────────────────────────────────

// AddUTXO persists a new unspent output to BadgerDB.
func (u *UTXOSet) AddUTXO(utxo UTXO) error {
	data, err := json.Marshal(utxoToJSON(utxo))
	if err != nil {
		return fmt.Errorf("marshal utxo: %w", err)
	}
	return u.Storage.SaveUTXO(utxoKey(utxo.TxID, utxo.OutputIndex), data)
}

// SpendUTXO removes a UTXO from the set, marking it as spent.
// Returns an error if the UTXO does not exist (double-spend attempt).
func (u *UTXOSet) SpendUTXO(txID []byte, outputIndex uint32) error {
	if err := u.Storage.DeleteUTXO(utxoKey(txID, outputIndex)); err != nil {
		return fmt.Errorf("spend utxo %s:%d: %w", hex.EncodeToString(txID), outputIndex, err)
	}
	return nil
}

// GetUTXO fetches a specific unspent output by transaction ID and output index.
func (u *UTXOSet) GetUTXO(txID []byte, outputIndex uint32) (*UTXO, error) {
	data, err := u.Storage.GetUTXO(utxoKey(txID, outputIndex))
	if err != nil {
		return nil, fmt.Errorf("get utxo %s:%d: %w", hex.EncodeToString(txID), outputIndex, err)
	}
	var j utxoJSON
	if err := json.Unmarshal(data, &j); err != nil {
		return nil, fmt.Errorf("unmarshal utxo: %w", err)
	}
	utxo, err := utxoFromJSON(j)
	if err != nil {
		return nil, err
	}
	return &utxo, nil
}

// GetUTXOsForAddress returns all unspent outputs locked to the given public key hash.
// Used to enumerate a wallet's spendable outputs.
func (u *UTXOSet) GetUTXOsForAddress(pubKeyHash []byte) ([]UTXO, error) {
	fmt.Printf("[UTXO] GetUTXOs start\n")
	defer fmt.Printf("[UTXO] GetUTXOs done\n")
	var results []UTXO
	err := u.Storage.IteratePrefix("utxo:", func(_, value []byte) error {
		var j utxoJSON
		if err := json.Unmarshal(value, &j); err != nil {
			return err
		}
		pkh, err := hex.DecodeString(j.PubKeyHash)
		if err != nil {
			return err
		}
		if bytes.Equal(pkh, pubKeyHash) {
			utxo, err := utxoFromJSON(j)
			if err != nil {
				return err
			}
			results = append(results, utxo)
		}
		return nil
	})
	return results, err
}

// GetBalance returns the total spendable balance (in Cash) for an address.
func (u *UTXOSet) GetBalance(pubKeyHash []byte) (uint64, error) {
	utxos, err := u.GetUTXOsForAddress(pubKeyHash)
	if err != nil {
		return 0, err
	}
	var total uint64
	for _, utxo := range utxos {
		total += utxo.Value
	}
	return total, nil
}

// ── Signature / ownership helpers ─────────────────────────────────────────────

// pubKeyToHash is a package-level alias for the exported PubKeyToHash in wallet.go.
func pubKeyToHash(publicKey []byte) []byte {
	return PubKeyToHash(publicKey)
}

// signedMessage returns the canonical message that must be signed to authorise
// spending a specific output: SHA256(TxID ‖ OutputIndex[4 bytes LE]).
func signedMessage(txID []byte, outputIndex uint32) []byte {
	buf := new(bytes.Buffer)
	buf.Write(txID)
	binary.Write(buf, binary.LittleEndian, outputIndex)
	h := sha256.Sum256(buf.Bytes())
	return h[:]
}

// ── Block processing ──────────────────────────────────────────────────────────

// ValidateAndSpendInputs verifies every input in tx and, if all are valid,
// removes the spent UTXOs from the set. Returns the spent UTXOs for undo logging.
//
// Checks per input:
//  1. The referenced UTXO exists (not already spent).
//  2. If the UTXO is coinbase, CoinbaseMaturity blocks have elapsed.
//  3. The Ed25519 signature is valid for SHA256(TxID‖OutputIndex).
//  4. The supplied public key hashes to the UTXO's PublicKeyHash.
func (u *UTXOSet) ValidateAndSpendInputs(tx *Transaction, currentHeight uint64) ([]UTXO, error) {
	spent := make([]UTXO, 0, len(tx.Inputs))
	for i, in := range tx.Inputs {
		utxo, err := u.GetUTXO(in.TxID, in.OutputIndex)
		if err != nil {
			return nil, fmt.Errorf("input %d: utxo not found (possible double spend): %w", i, err)
		}

		if utxo.IsCoinbase {
			if currentHeight < utxo.BlockHeight+CoinbaseMaturity {
				return nil, fmt.Errorf("input %d: coinbase output not yet mature (height %d, matures at %d)",
					i, currentHeight, utxo.BlockHeight+CoinbaseMaturity)
			}
		}

		msg := signedMessage(in.TxID, in.OutputIndex)
		if !ed25519.Verify(ed25519.PublicKey(in.PublicKey), msg, in.Signature) {
			return nil, fmt.Errorf("input %d: invalid Ed25519 signature", i)
		}

		derivedHash := pubKeyToHash(in.PublicKey)
		if !bytes.Equal(derivedHash, utxo.PublicKeyHash) {
			return nil, fmt.Errorf("input %d: public key does not match UTXO owner", i)
		}
		spent = append(spent, *utxo)
	}

	// All inputs valid — spend them.
	for i, in := range tx.Inputs {
		if err := u.SpendUTXO(in.TxID, in.OutputIndex); err != nil {
			return nil, fmt.Errorf("input %d: spend failed: %w", i, err)
		}
	}
	return spent, nil
}

// ProcessBlock applies an entire block to the UTXO set and returns undo data
// so the operation can be reversed during a chain reorganisation.
// Non-coinbase transactions are processed first (spend inputs, create outputs).
// The coinbase transaction is processed last to prevent spending the block
// reward in the same block it is created.
func (u *UTXOSet) ProcessBlock(b *Block, height uint64) (*BlockUndo, error) {
	fmt.Printf("[UTXO] ProcessBlock h=%d start\n", height)
	defer fmt.Printf("[UTXO] ProcessBlock h=%d done\n", height)
	undo := &BlockUndo{}
	var coinbaseTx *Transaction

	// First pass: non-coinbase transactions.
	for _, tx := range b.Transactions {
		if tx.IsCoinbaseTx() {
			coinbaseTx = tx
			continue
		}
		spent, err := u.ValidateAndSpendInputs(tx, height)
		if err != nil {
			return nil, fmt.Errorf("tx %s: %w", hex.EncodeToString(tx.TxID), err)
		}
		undo.SpentUTXOs = append(undo.SpentUTXOs, spent...)

		for idx, out := range tx.Outputs {
			utxo := UTXO{
				TxID:          tx.TxID,
				OutputIndex:   uint32(idx),
				Value:         out.Value,
				PublicKeyHash: out.PublicKeyHash,
				BlockHeight:   height,
				IsCoinbase:    false,
			}
			if err := u.AddUTXO(utxo); err != nil {
				return nil, fmt.Errorf("tx %s output %d: %w", hex.EncodeToString(tx.TxID), idx, err)
			}
			undo.CreatedRefs = append(undo.CreatedRefs, UTXORef{TxID: tx.TxID, OutputIndex: uint32(idx)})
		}
	}

	// Second pass: coinbase outputs.
	if coinbaseTx != nil {
		for idx, out := range coinbaseTx.Outputs {
			utxo := UTXO{
				TxID:          coinbaseTx.TxID,
				OutputIndex:   uint32(idx),
				Value:         out.Value,
				PublicKeyHash: out.PublicKeyHash,
				BlockHeight:   height,
				IsCoinbase:    true,
			}
			if err := u.AddUTXO(utxo); err != nil {
				return nil, fmt.Errorf("coinbase output %d: %w", idx, err)
			}
			undo.CreatedRefs = append(undo.CreatedRefs, UTXORef{TxID: coinbaseTx.TxID, OutputIndex: uint32(idx)})
		}
	}

	return undo, nil
}

// RollbackBlock reverses the UTXO changes made when a block was applied.
// Used during chain reorganisation to revert the old main chain before
// switching to the new one.
func (u *UTXOSet) RollbackBlock(undo *BlockUndo) error {
	// Delete all UTXOs created by the block.
	for _, ref := range undo.CreatedRefs {
		if err := u.SpendUTXO(ref.TxID, ref.OutputIndex); err != nil {
			return fmt.Errorf("rollback: delete created utxo %x:%d: %w",
				ref.TxID, ref.OutputIndex, err)
		}
	}
	// Restore all UTXOs that the block spent.
	for _, utxo := range undo.SpentUTXOs {
		if err := u.AddUTXO(utxo); err != nil {
			return fmt.Errorf("rollback: restore spent utxo %x:%d: %w",
				utxo.TxID, utxo.OutputIndex, err)
		}
	}
	return nil
}
