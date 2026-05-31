// rpc.go — HTTP JSON-RPC server for the Chakram block explorer.
// Uses only net/http — no external router libraries.
package main

import (
	"bytes"
	"context"
	"embed"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"strconv"
	"strings"
	"time"
)

//go:embed all:web/dist
var webDist embed.FS

//go:embed assets/chakram.png
var logoPNG []byte

// ── Server ────────────────────────────────────────────────────────────────────

type RPCServer struct {
	node   *Node
	port   int
	server *http.Server
}

func NewRPCServer(node *Node, port int) *RPCServer {
	return &RPCServer{node: node, port: port}
}

func (r *RPCServer) Start() error {
	mux := http.NewServeMux()
	mux.HandleFunc("/", r.route)
	r.server = &http.Server{
		Addr:         fmt.Sprintf("0.0.0.0:%d", r.port),
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
	go func() {
		if err := r.server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Printf("RPC server error: %v\n", err)
		}
	}()
	return nil
}

func (r *RPCServer) Stop() {
	if r.server != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		r.server.Shutdown(ctx) //nolint:errcheck
	}
}

// ── Router ────────────────────────────────────────────────────────────────────

func (r *RPCServer) route(w http.ResponseWriter, req *http.Request) {
	w.Header().Set("Access-Control-Allow-Origin", "*")
	w.Header().Set("Content-Type", "application/json")

	parts := strings.Split(strings.Trim(req.URL.Path, "/"), "/")

	// POST routes
	if req.Method == http.MethodPost {
		if len(parts) == 2 && parts[0] == "tx" && parts[1] == "submit" {
			r.handleTxSubmit(w, req)
			return
		}
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	if req.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	switch parts[0] {
	case "", "explorer", "wallet", "faucet", "docs", "download":
		// SPA: always serve index.html — React Router handles client-side routing.
		idx, err := webDist.ReadFile("web/dist/index.html")
		if err != nil {
			writeError(w, http.StatusNotFound, "not found")
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write(idx) //nolint:errcheck
	case "assets":
		// /assets/chakram.png — legacy path used by old HTML files kept in explorer/.
		if len(parts) == 2 && parts[1] == "chakram.png" {
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Cache-Control", "public, max-age=86400")
			w.Write(logoPNG) //nolint:errcheck
			return
		}
		// All other /assets/* — serve the React build output (hashed JS/CSS/images).
		// Must delete the pre-set application/json header: Go's FileServer skips
		// setting Content-Type if the header is already populated.
		sub, err := fs.Sub(webDist, "web/dist")
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal error")
			return
		}
		w.Header().Del("Content-Type")
		http.FileServer(http.FS(sub)).ServeHTTP(w, req)
	case "info":
		r.handleInfo(w)
	case "block":
		if len(parts) == 2 {
			r.handleBlockByHeight(w, parts[1])
		} else if len(parts) == 3 && parts[1] == "hash" {
			r.handleBlockByHash(w, parts[2])
		} else {
			writeError(w, http.StatusNotFound, "not found")
		}
	case "blocks":
		if len(parts) == 3 && parts[1] == "latest" {
			r.handleLatestBlocks(w, parts[2])
		} else {
			writeError(w, http.StatusNotFound, "not found")
		}
	case "tx":
		if len(parts) == 2 {
			r.handleTx(w, parts[1])
		} else {
			writeError(w, http.StatusNotFound, "not found")
		}
	case "address":
		if len(parts) == 2 {
			r.handleAddress(w, parts[1])
		} else {
			writeError(w, http.StatusNotFound, "not found")
		}
	case "utxos":
		if len(parts) == 2 {
			r.handleUTXOs(w, parts[1])
		} else {
			writeError(w, http.StatusNotFound, "not found")
		}
	case "peers":
		r.handlePeers(w)
	default:
		writeError(w, http.StatusNotFound, "not found")
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v) //nolint:errcheck
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// totalSupplyMined calculates total CHK rewarded for blocks 1..height.
func totalSupplyMined(height uint64) uint64 {
	var total uint64
	reward := InitialBlockReward
	remaining := height
	for remaining > 0 && reward > 0 {
		era := remaining
		if era > HalvingInterval {
			era = HalvingInterval
		}
		total += era * reward
		remaining -= era
		reward >>= 1
	}
	return total
}

// blockToJSON converts a Block to the standard API representation.
func blockToRPC(b *Block) map[string]interface{} {
	txs := make([]map[string]interface{}, 0, len(b.Transactions))
	for _, tx := range b.Transactions {
		inputs := make([]map[string]interface{}, 0, len(tx.Inputs))
		for _, in := range tx.Inputs {
			inputs = append(inputs, map[string]interface{}{
				"txid":         hex.EncodeToString(in.TxID),
				"output_index": in.OutputIndex,
			})
		}
		outputs := make([]map[string]interface{}, 0, len(tx.Outputs))
		for _, out := range tx.Outputs {
			outputs = append(outputs, map[string]interface{}{
				"value":       out.Value,
				"value_chk":   float64(out.Value) / float64(CashPerCHK),
				"pubkey_hash": hex.EncodeToString(out.PublicKeyHash),
			})
		}
		txs = append(txs, map[string]interface{}{
			"txid":        hex.EncodeToString(tx.TxID),
			"is_coinbase": tx.IsCoinbase,
			"inputs":      inputs,
			"outputs":     outputs,
		})
	}
	return map[string]interface{}{
		"height":        b.Header.Height,
		"hash":          hex.EncodeToString(b.Hash),
		"previous_hash": hex.EncodeToString(b.Header.PreviousHash),
		"timestamp":     b.Header.Timestamp,
		"difficulty":    b.Header.Difficulty,
		"nonce":         b.Header.Nonce,
		"tx_count":      len(b.Transactions),
		"transactions":  txs,
	}
}

// coinbaseAddress derives the miner address from the first transaction's first output.
// The coinbase tx is always at index 0.
func coinbaseAddress(b *Block) string {
	if len(b.Transactions) > 0 && len(b.Transactions[0].Outputs) > 0 {
		return PubKeyHashToAddress(b.Transactions[0].Outputs[0].PublicKeyHash)
	}
	return ""
}

// ── Handlers ──────────────────────────────────────────────────────────────────

func (r *RPCServer) handleInfo(w http.ResponseWriter) {
	bc := r.node.Blockchain
	network := "mainnet"
	if r.node.Config.Testnet {
		network = "testnet"
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"name":               CoinName,
		"ticker":             Ticker,
		"version":            Version,
		"network":            network,
		"height":             bc.GetHeight(),
		"peers":              len(r.node.Server.ConnectedPeers()),
		"sync_status":        r.node.SyncManager.SyncStatus(),
		"mining":             r.node.Config.Mine,
		"wallet":             r.node.Wallet.Address,
		"total_supply_mined": totalSupplyMined(bc.GetHeight()),
	})
}

func (r *RPCServer) handleBlockByHeight(w http.ResponseWriter, heightStr string) {
	h, err := strconv.ParseUint(heightStr, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid height")
		return
	}
	b, err := r.node.Blockchain.GetBlock(h)
	if err != nil {
		writeError(w, http.StatusNotFound, "block not found")
		return
	}
	writeJSON(w, http.StatusOK, blockToRPC(b))
}

func (r *RPCServer) handleBlockByHash(w http.ResponseWriter, hashStr string) {
	hash, err := hex.DecodeString(hashStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid hash")
		return
	}
	b, err := r.node.Blockchain.Storage.GetBlockByHash(hash)
	if err != nil {
		writeError(w, http.StatusNotFound, "block not found")
		return
	}
	writeJSON(w, http.StatusOK, blockToRPC(b))
}

func (r *RPCServer) handleLatestBlocks(w http.ResponseWriter, countStr string) {
	count, err := strconv.ParseUint(countStr, 10, 64)
	if err != nil || count == 0 {
		writeError(w, http.StatusBadRequest, "invalid count")
		return
	}
	if count > 50 {
		count = 50
	}
	bc := r.node.Blockchain
	tip := bc.GetHeight()

	results := make([]map[string]interface{}, 0, count)
	for i := uint64(0); i < count && tip >= i; i++ {
		h := tip - i
		b, err := bc.GetBlock(h)
		if err != nil {
			break
		}
		results = append(results, map[string]interface{}{
			"height":    b.Header.Height,
			"hash":      hex.EncodeToString(b.Hash),
			"timestamp": b.Header.Timestamp,
			"tx_count":  len(b.Transactions),
			"miner":     coinbaseAddress(b),
		})
	}
	writeJSON(w, http.StatusOK, results)
}

func (r *RPCServer) handleTx(w http.ResponseWriter, txidStr string) {
	txid, err := hex.DecodeString(txidStr)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid txid")
		return
	}
	bc := r.node.Blockchain

	// O(1) lookup via the tx index built during block application.
	height, err := bc.Storage.GetTxHeight(txid)
	if err != nil {
		writeError(w, http.StatusNotFound, "transaction not found")
		return
	}

	b, err := bc.GetBlock(height)
	if err != nil {
		writeError(w, http.StatusNotFound, "block not found")
		return
	}

	for _, tx := range b.Transactions {
		if !bytes.Equal(tx.TxID, txid) {
			continue
		}
		inputs := make([]map[string]interface{}, 0, len(tx.Inputs))
		for _, in := range tx.Inputs {
			inputs = append(inputs, map[string]interface{}{
				"txid":         hex.EncodeToString(in.TxID),
				"output_index": in.OutputIndex,
			})
		}
		outputs := make([]map[string]interface{}, 0, len(tx.Outputs))
		for _, out := range tx.Outputs {
			outputs = append(outputs, map[string]interface{}{
				"value":       out.Value,
				"value_chk":   float64(out.Value) / float64(CashPerCHK),
				"pubkey_hash": hex.EncodeToString(out.PublicKeyHash),
			})
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"txid":         hex.EncodeToString(tx.TxID),
			"block_height": b.Header.Height,
			"is_coinbase":  tx.IsCoinbase,
			"inputs":       inputs,
			"outputs":      outputs,
			"timestamp":    tx.Timestamp,
		})
		return
	}
	writeError(w, http.StatusNotFound, "transaction not found")
}

func (r *RPCServer) handleAddress(w http.ResponseWriter, address string) {
	pkh, err := AddressToPubKeyHash(address)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid address")
		return
	}
	utxos, err := r.node.Blockchain.UTXOSet.GetUTXOsForAddress(pkh)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query UTXOs")
		return
	}
	var balance uint64
	for _, u := range utxos {
		balance += u.Value
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"address":     address,
		"balance":     balance,
		"balance_chk": float64(balance) / float64(CashPerCHK),
		"utxo_count":  len(utxos),
	})
}

func (r *RPCServer) handlePeers(w http.ResponseWriter) {
	peers := r.node.Server.ConnectedPeers()
	result := make([]map[string]interface{}, 0, len(peers))
	for _, p := range peers {
		result = append(result, map[string]interface{}{
			"address":   p.Address,
			"height":    p.Height,
			"connected": p.Connected,
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (r *RPCServer) handleUTXOs(w http.ResponseWriter, address string) {
	pkh, err := AddressToPubKeyHash(address)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid address")
		return
	}
	utxos, err := r.node.Blockchain.UTXOSet.GetUTXOsForAddress(pkh)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query UTXOs")
		return
	}
	height := r.node.Blockchain.GetHeight()
	result := make([]map[string]interface{}, 0, len(utxos))
	for _, u := range utxos {
		mature := !u.IsCoinbase || height >= u.BlockHeight+CoinbaseMaturity
		result = append(result, map[string]interface{}{
			"txid":         hex.EncodeToString(u.TxID),
			"output_index": u.OutputIndex,
			"value":        u.Value,
			"value_chk":    float64(u.Value) / float64(CashPerCHK),
			"block_height": u.BlockHeight,
			"is_coinbase":  u.IsCoinbase,
			"mature":       mature,
		})
	}
	writeJSON(w, http.StatusOK, result)
}

func (r *RPCServer) handleTxSubmit(w http.ResponseWriter, req *http.Request) {
	var tx Transaction
	if err := json.NewDecoder(req.Body).Decode(&tx); err != nil {
		writeError(w, http.StatusBadRequest, "invalid transaction JSON: "+err.Error())
		return
	}
	if err := tx.Validate(); err != nil {
		writeError(w, http.StatusBadRequest, "transaction invalid: "+err.Error())
		return
	}
	if err := r.node.Mempool.Add(&tx); err != nil {
		writeError(w, http.StatusBadRequest, "mempool rejected: "+err.Error())
		return
	}
	msg, err := NewMessage(r.node.Server.magic, MsgTx, &tx)
	if err == nil {
		r.node.Server.Broadcast(msg, nil)
	}
	writeJSON(w, http.StatusOK, map[string]string{
		"txid":   hex.EncodeToString(tx.TxID),
		"status": "submitted",
	})
}
