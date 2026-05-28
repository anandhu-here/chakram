// node.go — Production Chakram node entrypoint.
// Wires together blockchain, wallet, mempool, P2P server, and sync manager.
package main

import (
	"context"
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
	home, err := os.UserHomeDir()
	if err != nil || home == "" {
		home = "/tmp"
		fmt.Println("WARNING: could not determine home directory, using /tmp")
	}
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
		fmt.Printf("Wallet loaded:  %s\n", wallet.Address)
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
	if n.Config.Mine {
		miningAddr := n.Wallet.Address
		if n.Config.MinerAddr != "" {
			miningAddr = n.Config.MinerAddr
		}
		fmt.Printf("Mining to: %s\n", miningAddr)
	}
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
// Guarantees completion within 5 seconds.
func (n *Node) Stop() {
	n.stopOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		done := make(chan struct{})
		go func() {
			defer close(done)
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
		}()

		select {
		case <-done:
			fmt.Println("Node stopped cleanly.")
		case <-ctx.Done():
			fmt.Println("Node stop timed out — forcing exit.")
		}
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
		pubKeyHash := n.Wallet.GetPubKeyHash()
		if n.Config.MinerAddr != "" {
			if pkh, err := AddressToPubKeyHash(n.Config.MinerAddr); err == nil {
				pubKeyHash = pkh
			}
		}
		cb := NewCoinbaseTransaction(pubKeyHash, height)

		pending := n.Mempool.GetAll()
		if len(pending) > 100 {
			pending = pending[:100]
		}
		txs := make([]*Transaction, 0, 1+len(pending))
		txs = append(txs, cb)
		txs = append(txs, pending...)

		diff := NextDifficulty(n.Blockchain, height)
		b := NewBlock(prev.Hash, height, diff, txs)
		if b.Header.Timestamp <= prev.Header.Timestamp {
			b.Header.Timestamp = prev.Header.Timestamp + 1
		}

		epochKey := n.epochKey(height)
		if err := MineBlock(b, n.Engine, epochKey); err != nil {
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

// ── RandomX epoch key ─────────────────────────────────────────────────────────

// epochKey returns the RandomX seed key for the block at the given height.
// It uses the hash of the most recent epoch-boundary block, falling back to
// the genesis hash if that block is not yet available.
func (n *Node) epochKey(height uint64) []byte {
	epochStart := (height / RandomXEpochLen) * RandomXEpochLen
	b, err := n.Blockchain.Storage.GetBlockByHeight(epochStart)
	if err == nil {
		return b.Hash
	}
	// Fallback to genesis hash (covers the first epoch and any storage error).
	genesis, err := n.Blockchain.Storage.GetBlockByHeight(0)
	if err == nil {
		return genesis.Hash
	}
	return []byte("chakram-genesis-seed")
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
