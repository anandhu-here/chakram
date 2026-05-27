// main.go — Phase 4 smoke test: Wallets, Keys, and signed transactions.
package main

import (
	"bytes"
	"encoding/hex"
	"fmt"
	"os"
)

func chk(err error, msg string) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL %s: %v\n", msg, err)
		os.Exit(1)
	}
}

func toCHK(cash uint64) float64 {
	return float64(cash) / float64(CashPerCHK)
}

func main() {
	fmt.Println("=== Chakram Phase 4 — Wallet Test ===")

	// ── 2. Generate wallet ────────────────────────────────────────────────────
	wallet, err := NewWallet()
	chk(err, "NewWallet")

	fmt.Println("\n--- New Wallet ---")
	fmt.Printf("Address:     %s\n", wallet.Address)
	fmt.Printf("Mnemonic:    %s\n", wallet.Mnemonic)
	fmt.Printf("PublicKey:   %s\n", hex.EncodeToString(wallet.KeyPair.PublicKey))
	fmt.Printf("PubKeyHash:  %s\n", hex.EncodeToString(wallet.GetPubKeyHash()))

	// ── 3. Validate address ───────────────────────────────────────────────────
	fmt.Printf("\nAddress valid: %v\n", ValidateAddress(wallet.Address))

	// ── 4. Address round-trip ─────────────────────────────────────────────────
	recovered, err := AddressToPubKeyHash(wallet.Address)
	chk(err, "AddressToPubKeyHash")
	fmt.Printf("PubKeyHash round-trip matches: %v\n",
		bytes.Equal(recovered, wallet.GetPubKeyHash()))

	// ── 5. Save and load wallet ───────────────────────────────────────────────
	fmt.Println("\n--- Wallet File ---")
	chk(wallet.SaveToFile("./test-wallet.json", "chakram123"), "SaveToFile")

	loaded, err := LoadWalletFromFile("./test-wallet.json", "chakram123")
	chk(err, "LoadWalletFromFile")
	fmt.Printf("Wallet loaded successfully: %v\n", err == nil)
	fmt.Printf("Loaded address matches:     %v\n", loaded.Address == wallet.Address)

	_, wrongErr := LoadWalletFromFile("./test-wallet.json", "wrongpassword")
	fmt.Printf("Wrong password rejected:    %v\n", wrongErr != nil)

	// ── 6. Mnemonic restore ───────────────────────────────────────────────────
	restored, err := WalletFromMnemonic(wallet.Mnemonic)
	chk(err, "WalletFromMnemonic")
	fmt.Printf("\nMnemonic restore address matches: %v\n", restored.Address == wallet.Address)

	// ── 7. Second wallet ──────────────────────────────────────────────────────
	wallet2, err := NewWallet()
	chk(err, "NewWallet wallet2")
	fmt.Printf("\nWallet 2 address: %s\n", wallet2.Address)

	// ── 8. Open blockchain ────────────────────────────────────────────────────
	bc, err := NewBlockchain("./chakram-data")
	chk(err, "NewBlockchain")
	defer bc.Close()

	engine := &RandomXEngine{}
	defer engine.Close()

	genesis, err := bc.GetBlock(0)
	chk(err, "GetBlock genesis")

	// ── 9. Mine block 1 with coinbase to wallet ───────────────────────────────
	fmt.Println("\n--- Mining block 1 ---")
	coinbaseTx1 := NewCoinbaseTransaction(wallet.GetPubKeyHash(), 1)
	block1 := NewBlock(genesis.Hash, 1, MinDifficulty, []*Transaction{coinbaseTx1})
	block1.Header.Timestamp = genesis.Header.Timestamp + 61
	chk(MineBlock(block1, engine), "MineBlock 1")
	chk(bc.AddBlock(block1), "AddBlock 1")
	fmt.Printf("Block 1 mined, reward to: %s\n", wallet.Address)

	// ── 10. Mine 100 more blocks for maturity ─────────────────────────────────
	fmt.Print("\nMining 100 blocks for maturity")
	for h := uint64(2); h <= 101; h++ {
		prev, err := bc.GetLastBlock()
		chk(err, fmt.Sprintf("GetLastBlock at %d", h))

		cb := NewCoinbaseTransaction(wallet.GetPubKeyHash(), h)
		b := NewBlock(prev.Hash, h, MinDifficulty, []*Transaction{cb})
		b.Header.Timestamp = prev.Header.Timestamp + 61
		chk(MineBlock(b, engine), fmt.Sprintf("MineBlock %d", h))
		chk(bc.AddBlock(b), fmt.Sprintf("AddBlock %d", h))

		if h%10 == 0 {
			fmt.Print(".")
			os.Stdout.Sync()
		}
	}
	fmt.Printf("\nChain height: %d\n", bc.GetHeight())

	// ── 11. Check wallet balance ──────────────────────────────────────────────
	balance, err := wallet.GetBalance(bc.UTXOSet)
	chk(err, "GetBalance")
	fmt.Printf("\nWallet balance: %.6f CHK\n", toCHK(balance))

	// ── 12. Create and sign transfer: 5 CHK → wallet2 ────────────────────────
	fmt.Println("\n--- Signing transfer ---")

	utxos, err := bc.UTXOSet.GetUTXOsForAddress(wallet.GetPubKeyHash())
	chk(err, "GetUTXOsForAddress")

	// Find the block-1 coinbase (now mature: height 101 >= 1 + 100).
	var spendUTXO *UTXO
	for i := range utxos {
		if utxos[i].BlockHeight == 1 && utxos[i].IsCoinbase {
			spendUTXO = &utxos[i]
			break
		}
	}
	if spendUTXO == nil {
		fmt.Fprintln(os.Stderr, "FATAL: could not find block-1 coinbase UTXO")
		os.Exit(1)
	}

	const transferCash = uint64(5) * CashPerCHK        // 5 CHK
	const changeCash   = uint64(50)*CashPerCHK - transferCash - MinTxFee // 44.999 CHK

	inputs := []TxInput{{TxID: spendUTXO.TxID, OutputIndex: spendUTXO.OutputIndex}}
	outputs := []TxOutput{
		{Value: transferCash, PublicKeyHash: wallet2.GetPubKeyHash()},
		{Value: changeCash,   PublicKeyHash: wallet.GetPubKeyHash()},
	}
	transferTx := NewTransaction(inputs, outputs)
	chk(SignTransaction(transferTx, wallet), "SignTransaction")

	// ── Mine block 102 with coinbase + transfer ───────────────────────────────
	prev, err := bc.GetLastBlock()
	chk(err, "GetLastBlock for block 102")

	coinbaseTx102 := NewCoinbaseTransaction(wallet.GetPubKeyHash(), 102)
	block102 := NewBlock(prev.Hash, 102, MinDifficulty,
		[]*Transaction{coinbaseTx102, transferTx})
	block102.Header.Timestamp = prev.Header.Timestamp + 61
	chk(MineBlock(block102, engine), "MineBlock 102")
	chk(bc.AddBlock(block102), "AddBlock 102")
	fmt.Printf("Transfer mined in block 102 (%d txs)\n", len(block102.Transactions))

	// ── 13. Final balances ────────────────────────────────────────────────────
	fmt.Println("\n--- Final Balances ---")
	w1bal, err := wallet.GetBalance(bc.UTXOSet)
	chk(err, "GetBalance wallet1")
	w2bal, err := wallet2.GetBalance(bc.UTXOSet)
	chk(err, "GetBalance wallet2")
	fmt.Printf("Wallet 1 balance: %.6f CHK\n", toCHK(w1bal))
	fmt.Printf("Wallet 2 balance: %.6f CHK\n", toCHK(w2bal))

	// ── 14. Validate chain ────────────────────────────────────────────────────
	valid, err := bc.IsValid()
	chk(err, "IsValid")
	fmt.Printf("\nChain valid: %v  (height: %d)\n", valid, bc.GetHeight())

	// ── 15. Cleanup ───────────────────────────────────────────────────────────
	os.Remove("./test-wallet.json")

	fmt.Println("\n=== Phase 4 Complete ===")
}
