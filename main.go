// main.go — Chakram CLI entrypoint.
package main

import (
	"fmt"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		args = []string{"node"}
	}

	switch args[0] {
	case "node":
		runNode(args[1:])
	case "wallet":
		if len(args) < 2 {
			printUsage()
			os.Exit(1)
		}
		runWallet(args[1:])
	case "send":
		runSend(args[1:])
	case "status":
		runStatus(args[1:])
	default:
		printUsage()
		os.Exit(1)
	}
}

// ── node command ──────────────────────────────────────────────────────────────

func runNode(args []string) {
	testnet := false
	mine := false
	for _, a := range args {
		switch a {
		case "--testnet":
			testnet = true
		case "--mine":
			mine = true
		}
	}

	cfg := DefaultConfig(testnet)
	cfg.Mine = mine

	node, err := NewNode(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
		os.Exit(1)
	}
	if err := node.Start(); err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
		os.Exit(1)
	}

	c := make(chan os.Signal, 1)
	signal.Notify(c, os.Interrupt, syscall.SIGTERM)
	<-c
	fmt.Println("\nShutting down...")
	node.Stop()
}

// ── wallet commands ───────────────────────────────────────────────────────────

func runWallet(args []string) {
	testnet := false
	for _, a := range args {
		if a == "--testnet" {
			testnet = true
		}
	}

	switch args[0] {
	case "new":
		w, err := NewWallet()
		if err != nil {
			fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("Address:  %s\n", w.Address)
		fmt.Printf("Mnemonic: %s\n", w.Mnemonic)
		fmt.Println("IMPORTANT: Back up your mnemonic phrase — it cannot be recovered!")

	case "address":
		cfg := DefaultConfig(testnet)
		w, err := LoadWalletFromFile(cfg.WalletFile, "chakram")
		if err != nil {
			fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
			os.Exit(1)
		}
		fmt.Println(w.Address)

	case "balance":
		cfg := DefaultConfig(testnet)
		bc, err := NewBlockchain(cfg.DataDir)
		if err != nil {
			fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
			os.Exit(1)
		}
		defer bc.Close()
		w, err := LoadWalletFromFile(cfg.WalletFile, "chakram")
		if err != nil {
			fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
			os.Exit(1)
		}
		bal, err := w.GetBalance(bc.UTXOSet)
		if err != nil {
			fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
			os.Exit(1)
		}
		fmt.Printf("%.6f CHK\n", float64(bal)/float64(CashPerCHK))

	default:
		printUsage()
		os.Exit(1)
	}
}

// ── send command ──────────────────────────────────────────────────────────────

func runSend(args []string) {
	if len(args) < 2 {
		fmt.Fprintln(os.Stderr, "usage: chakram send <address> <amount>")
		os.Exit(1)
	}
	fmt.Println("send: not yet implemented")
}

// ── status command ────────────────────────────────────────────────────────────

func runStatus(args []string) {
	testnet := false
	for _, a := range args {
		if a == "--testnet" {
			testnet = true
		}
	}
	cfg := DefaultConfig(testnet)
	bc, err := NewBlockchain(cfg.DataDir)
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL: %v\n", err)
		os.Exit(1)
	}
	defer bc.Close()
	valid, err := bc.IsValid()
	if err != nil {
		fmt.Fprintf(os.Stderr, "chain validation error: %v\n", err)
	}
	fmt.Printf("Height:      %d\n", bc.GetHeight())
	fmt.Printf("Chain valid: %v\n", valid)
}

// ── usage ─────────────────────────────────────────────────────────────────────

func printUsage() {
	fmt.Println("Usage:")
	fmt.Println("  chakram node                    — start full node")
	fmt.Println("  chakram node --mine             — start node with mining")
	fmt.Println("  chakram node --testnet          — start on testnet")
	fmt.Println("  chakram wallet new              — generate new wallet")
	fmt.Println("  chakram wallet address          — show wallet address")
	fmt.Println("  chakram wallet balance          — show wallet balance")
	fmt.Println("  chakram send <address> <amount> — send CHK")
	fmt.Println("  chakram status                  — show chain status")
}
