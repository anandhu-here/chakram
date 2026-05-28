// node.go — Production Chakram node entrypoint.
// Wires together blockchain, wallet, mempool, P2P server, and sync manager.
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// ── Config ────────────────────────────────────────────────────────────────────

type NodeConfig struct {
	DataDir    string
	WalletFile string
	Password   string
	Port       int
	Testnet    bool
	Mine       bool
	MinerAddr  string
	LogLevel   string
	Seeds      []string
}

// DefaultConfig returns sensible defaults for mainnet or testnet.
func DefaultConfig(testnet bool) NodeConfig {
	home, _ := os.UserHomeDir()
	network := "mainnet"
	port := DefaultPortMainnet
	seeds := MainnetSeeds
	if testnet {
		network = "testnet"
		port = DefaultPortTestnet
		seeds = TestnetSeeds
	}
	dataDir := filepath.Join(home, ".chakram", network)
	return NodeConfig{
		DataDir:    dataDir,
		WalletFile: filepath.Join(dataDir, "wallet.json"),
		Port:       port,
		Testnet:    testnet,
		LogLevel:   "info",
		Seeds:      seeds,
	}
}

// ── Node ──────────────────────────────────────────────────────────────────────

type Node struct {
	Config      NodeConfig
	Blockchain  *Blockchain
	Mempool     *Mempool
	Wallet      *Wallet
	Server      *Server
	SyncManager *SyncManager
	RPCServer   *RPCServer
	Engine      *RandomXEngine
	quit        chan struct{}
	miningQuit  chan struct{}
	stopOnce    sync.Once
}

// NewNode constructs a fully wired node from cfg.
// It opens the blockchain, loads or creates a wallet, and sets up P2P.
func NewNode(cfg NodeConfig) (*Node, error) {
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	bc, err := NewBlockchain(cfg.DataDir)
	if err != nil {
		return nil, fmt.Errorf("open blockchain: %w", err)
	}

	mp := NewMempool()

	password := cfg.Password
	if password == "" {
		password = "chakram"
		fmt.Println("WARNING: using default wallet password. Run with --password to set a secure one.")
	}

	var wallet *Wallet
	if _, statErr := os.Stat(cfg.WalletFile); statErr == nil {
		wallet, err = LoadWalletFromFile(cfg.WalletFile, password)
		if err != nil {
			return nil, fmt.Errorf("load wallet: %w", err)
		}
	} else {
		wallet, err = NewWallet()
		if err != nil {
			return nil, fmt.Errorf("create wallet: %w", err)
		}
		if err := wallet.SaveToFile(cfg.WalletFile, password); err != nil {
			return nil, fmt.Errorf("save wallet: %w", err)
		}
		fmt.Printf("New wallet created: %s\n", wallet.Address)
		fmt.Printf("Mnemonic: %s\n", wallet.Mnemonic)
		fmt.Println("IMPORTANT: Back up your mnemonic phrase — it cannot be recovered!")
	}

	srv := NewServer(bc, mp, cfg.Port, cfg.Testnet)
	sm := NewSyncManager(bc, srv)
	srv.SetSyncManager(sm)

	rpcPort := RPCPortMainnet
	if cfg.Testnet {
		rpcPort = RPCPortTestnet
	}

	node := &Node{
		Config:      cfg,
		Blockchain:  bc,
		Mempool:     mp,
		Wallet:      wallet,
		Server:      srv,
		SyncManager: sm,
		quit:        make(chan struct{}),
	}
	node.RPCServer = NewRPCServer(node, rpcPort)

	if cfg.Mine {
		node.Engine = &RandomXEngine{}
		node.miningQuit = make(chan struct{})
	}

	return node, nil
}

// ── Start / Stop ──────────────────────────────────────────────────────────────

func (n *Node) Start() error {
	fmt.Println("╔═══════════════════════════════════╗")
	fmt.Println("║         CHAKRAM NODE v1.0         ║")
	fmt.Println("║   ചക്രം — Kerala's Digital Coin   ║")
	fmt.Println("╚═══════════════════════════════════╝")

	network := "Mainnet"
	if n.Config.Testnet {
		network = "Testnet"
	}
	fmt.Printf("Network: %s\n", network)
	fmt.Printf("Address: %s\n", n.Wallet.Address)
	fmt.Printf("Height:  %d\n", n.Blockchain.GetHeight())
	fmt.Printf("DataDir: %s\n", n.Config.DataDir)
	fmt.Println()

	n.SyncManager.Start()

	if err := n.Server.Start(); err != nil {
		return fmt.Errorf("start server: %w", err)
	}

	for _, seed := range n.Config.Seeds {
		if err := n.Server.ConnectToPeer(seed); err != nil {
			fmt.Printf("  seed %s: unreachable (%v)\n", seed, err)
		} else {
			fmt.Printf("  seed %s: connected\n", seed)
		}
	}

	if err := n.RPCServer.Start(); err != nil {
		return fmt.Errorf("start rpc: %w", err)
	}
	fmt.Printf("RPC:     http://0.0.0.0:%d\n", n.RPCServer.port)

	if n.Config.Mine {
		go n.mineLoop()
	}

	fmt.Println("Node started. Press Ctrl+C to stop.")
	return nil
}

// Stop shuts down all subsystems cleanly. Safe to call more than once.
func (n *Node) Stop() {
	n.stopOnce.Do(func() {
		if n.Config.Mine && n.miningQuit != nil {
			close(n.miningQuit)
		}
		n.RPCServer.Stop()
		n.SyncManager.Stop()
		n.Server.Stop()
		n.Blockchain.Close()
		if n.Config.Mine && n.Engine != nil {
			n.Engine.Close()
		}
		fmt.Println("Node stopped cleanly.")
	})
}

// ── Mining ────────────────────────────────────────────────────────────────────

func (n *Node) mineLoop() {
	for {
		select {
		case <-n.miningQuit:
			return
		default:
		}

		prev, err := n.Blockchain.GetLastBlock()
		if err != nil {
			time.Sleep(time.Second)
			continue
		}

		height := prev.Header.Height + 1
		cb := NewCoinbaseTransaction(n.Wallet.GetPubKeyHash(), height)

		pending := n.Mempool.GetAll()
		if len(pending) > 100 {
			pending = pending[:100]
		}
		txs := make([]*Transaction, 0, 1+len(pending))
		txs = append(txs, cb)
		txs = append(txs, pending...)

		b := NewBlock(prev.Hash, height, MinDifficulty, txs)
		if b.Header.Timestamp <= prev.Header.Timestamp {
			b.Header.Timestamp = prev.Header.Timestamp + 1
		}

		if err := MineBlock(b, n.Engine); err != nil {
			continue
		}

		select {
		case <-n.miningQuit:
			return
		default:
		}

		if err := n.Blockchain.AddBlock(b); err != nil {
			continue
		}

		n.Mempool.ClearConfirmed(b.Transactions)

		inv, err := NewMessage(n.Server.magic, MsgInv, InvPayload{
			Items: []InvItem{{Type: 1, Hash: b.Hash}},
		})
		if err == nil {
			n.Server.Broadcast(inv, nil)
		}

		fmt.Printf("⛏  Mined block %d — hash: %x\n", height, b.Hash)
	}
}

// ── Status ────────────────────────────────────────────────────────────────────

func (n *Node) Status() string {
	balance, _ := n.Wallet.GetBalance(n.Blockchain.UTXOSet)
	mining := "off"
	if n.Config.Mine {
		mining = "on"
	}
	return fmt.Sprintf(
		"Height: %d | Peers: %d | Sync: %s | Mining: %s | Balance: %.6f CHK",
		n.Blockchain.GetHeight(),
		n.Server.PeerCount(),
		n.SyncManager.SyncStatus(),
		mining,
		float64(balance)/float64(CashPerCHK),
	)
}
