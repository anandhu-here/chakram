// send.go — CHK transfer logic for the `chakram send` command.
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// SendCHK builds, signs, and submits a CHK transfer to the local running node.
// Returns the hex TxID on success.
func SendCHK(cfg NodeConfig, toAddress string, amountCHK float64) (string, error) {
	// 1. Validate destination address.
	if !ValidateAddress(toAddress) {
		return "", fmt.Errorf("invalid address: %s", toAddress)
	}

	// 2. Convert to Cash units.
	amountCash := uint64(amountCHK * float64(CashPerCHK))
	if amountCash == 0 {
		return "", fmt.Errorf("amount must be greater than 0")
	}

	// 3. Open blockchain (read-only — we only need UTXOs and height).
	bc, err := NewBlockchain(cfg.DataDir)
	if err != nil {
		return "", fmt.Errorf("open blockchain: %w", err)
	}
	defer bc.Close()

	// 4. Load wallet.
	password := cfg.Password
	if password == "" {
		password = "chakram"
	}
	wallet, err := LoadWalletFromFile(cfg.WalletFile, password)
	if err != nil {
		return "", fmt.Errorf("load wallet: %w", err)
	}

	// 5. Fetch all UTXOs for this wallet.
	utxos, err := bc.UTXOSet.GetUTXOsForAddress(wallet.GetPubKeyHash())
	if err != nil {
		return "", fmt.Errorf("get UTXOs: %w", err)
	}

	// 6. Coin selection — skip immature coinbase outputs.
	fee := MinTxFee
	needed := amountCash + fee
	currentHeight := bc.GetHeight()

	var selected []UTXO
	var total uint64
	var matureBalance uint64

	for _, u := range utxos {
		if u.IsCoinbase && currentHeight < u.BlockHeight+CoinbaseMaturity {
			continue
		}
		matureBalance += u.Value
		if total < needed {
			selected = append(selected, u)
			total += u.Value
		}
	}

	if total < needed {
		return "", fmt.Errorf(
			"insufficient mature balance: have %.6f CHK, need %.6f CHK",
			float64(matureBalance)/float64(CashPerCHK),
			float64(needed)/float64(CashPerCHK),
		)
	}

	// 7. Build inputs.
	inputs := make([]TxInput, len(selected))
	for i, u := range selected {
		inputs[i] = TxInput{TxID: u.TxID, OutputIndex: u.OutputIndex}
	}

	// 8. Build outputs — send + change.
	toPKH, err := AddressToPubKeyHash(toAddress)
	if err != nil {
		return "", fmt.Errorf("resolve to address: %w", err)
	}
	outputs := []TxOutput{
		{Value: amountCash, PublicKeyHash: toPKH},
	}
	if change := total - amountCash - fee; change > 0 {
		outputs = append(outputs, TxOutput{
			Value:         change,
			PublicKeyHash: wallet.GetPubKeyHash(),
		})
	}

	// 9. Create transaction.
	tx := NewTransaction(inputs, outputs)

	// 10. Sign.
	if err := SignTransaction(tx, wallet); err != nil {
		return "", fmt.Errorf("sign transaction: %w", err)
	}

	// 11. Structural validation.
	if err := tx.Validate(); err != nil {
		return "", fmt.Errorf("transaction invalid: %w", err)
	}

	// 12. Submit to the local running node via RPC.
	rpcPort := RPCPortMainnet
	if cfg.Testnet {
		rpcPort = RPCPortTestnet
	}

	body, err := json.Marshal(tx)
	if err != nil {
		return "", fmt.Errorf("encode transaction: %w", err)
	}

	url := fmt.Sprintf("http://localhost:%d/tx/submit", rpcPort)
	resp, err := http.Post(url, "application/json", bytes.NewReader(body)) //nolint:noctx
	if err != nil {
		if strings.Contains(err.Error(), "connection refused") {
			return "", fmt.Errorf(
				"node is not running. Start your node first with:\n  ./chakram node --testnet",
			)
		}
		return "", fmt.Errorf("submit transaction: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]string
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", fmt.Errorf("decode response: %w", err)
	}
	if errMsg, ok := result["error"]; ok {
		return "", fmt.Errorf("node rejected transaction: %s", errMsg)
	}

	return result["txid"], nil
}
