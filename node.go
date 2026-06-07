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

// isatty returns true when stdout is an interactive terminal.
// Used to suppress sensitive output (mnemonic) when running as a systemd service.
func isatty() bool {
	fi, err := os.Stdout.Stat()
	if err != nil {
		return false
	}
	return (fi.Mode() & os.ModeCharDevice) != 0
}

// ── Config ────────────────────────────────────────────────────────────────────

type NodeConfig struct {
	DataDir        string
	WalletFile     string
	Password       string
	Port           int
	Testnet        bool
	Mine           bool
	MinerAddr      string
	MiningThreads  int
	LogLevel       string
	Seeds          []string
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
	Engine        *RandomXEngine
	quit          chan struct{}
	miningQuit    chan struct{}
	mineLoopDone  chan struct{}
	stopOnce      sync.Once
}

// NewNode constructs a fully wired node from cfg.
// It opens the blockchain, loads or creates a wallet, and sets up P2P.
func NewNode(cfg NodeConfig) (*Node, error) {
	if err := os.MkdirAll(cfg.DataDir, 0755); err != nil {
		return nil, fmt.Errorf("create data dir: %w", err)
	}

	// Mining nodes share their engine with the verifier (Fix 2); seed nodes
	// create their own. Pass createVerifyEngine = !cfg.Mine.
	bc, err := NewBlockchain(cfg.DataDir, !cfg.Mine)
	if err != nil {
		return nil, fmt.Errorf("open blockchain: %w", err)
	}

	mp := NewMempool()
	mp.SetBlockchain(bc)

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
		if isatty() {
			fmt.Printf("Mnemonic: %s\n", wallet.Mnemonic)
			fmt.Println("IMPORTANT: Back up your mnemonic phrase — it cannot be recovered!")
		} else {
			fmt.Println("Mnemonic suppressed (not a terminal) — recover via wallet file.")
		}
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
		node.Engine = NewRandomXEngine()
		bc.SetVerifyEngine(node.Engine) // share engine — one Argon2d init per epoch
		node.miningQuit = make(chan struct{})
		node.mineLoopDone = make(chan struct{})
	}

	return node, nil
}

// ── Start / Stop ──────────────────────────────────────────────────────────────

func (n *Node) Start() error {
	fmt.Println("╔═══════════════════════════════════╗")
	fmt.Printf("║      CHAKRAM NODE %-16s║\n", SoftwareVersion)
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
		if n.Server.isOwnAddress(seed) {
			fmt.Printf("  seed %s: skipping (own address)\n", seed)
			continue
		}
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

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				// Seeds are hardcoded infrastructure — always reconnect to them
				// unconditionally, regardless of total peer count. This keeps
				// block propagation alive across seed restarts without requiring
				// miners to restart too.
				for _, seed := range n.Config.Seeds {
					if n.Server.isOwnAddress(seed) {
						continue
					}
					if !n.Server.IsConnected(seed) {
						n.Server.ConnectToPeer(seed) //nolint:errcheck
					}
				}
			case <-n.quit:
				return
			}
		}
	}()

	fmt.Println("Node started. Press Ctrl+C to stop.")
	return nil
}

// Stop shuts down all subsystems cleanly. Safe to call more than once.
// Guarantees completion within 5 seconds.
func (n *Node) Stop() {
	n.stopOnce.Do(func() {
		close(n.quit)

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()

		done := make(chan struct{})
		go func() {
			defer close(done)
			if n.Config.Mine && n.miningQuit != nil {
				close(n.miningQuit)
				// Wait for mineLoop to exit before closing the engine to
				// prevent Close() racing with a Hash() call inside MineBlock.
				if n.mineLoopDone != nil {
					select {
					case <-n.mineLoopDone:
					case <-time.After(10 * time.Second):
						fmt.Println("WARNING: mineLoop did not exit within 10s")
					}
				}
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
	defer close(n.mineLoopDone)
	for {
		select {
		case <-n.miningQuit:
			return
		default:
		}

		// Use ConnectedPeers (handshake complete) not PeerCount (includes dead
		// connections not yet evicted by the ping loop).
		connPeers := n.Server.ConnectedPeers()
		if len(connPeers) < 2 {
			fmt.Printf("Mining paused — waiting for peers (have %d connected, need 2)\n", len(connPeers))
			// Immediately attempt reconnect to seeds instead of waiting for the 30s ticker.
			for _, seed := range n.Config.Seeds {
				if !n.Server.isOwnAddress(seed) && !n.Server.IsConnected(seed) {
					n.Server.ConnectToPeer(seed) //nolint:errcheck
				}
			}
			time.Sleep(5 * time.Second)
			continue
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
		// Pick pending transactions, compute fees, filter any whose UTXOs are spent.
		allPending := n.Mempool.GetAll()
		if len(allPending) > 100 {
			allPending = allPending[:100]
		}
		var totalFees uint64
		pending := allPending[:0]
		for _, tx := range allPending {
			fee, err := n.Blockchain.UTXOSet.CalculateFee(tx)
			if err != nil {
				continue // UTXO already spent or invalid — skip
			}
			totalFees += fee
			pending = append(pending, tx)
		}

		cb := NewCoinbaseTransaction(pubKeyHash, height, totalFees)
		txs := make([]*Transaction, 0, 1+len(pending))
		txs = append(txs, cb)
		txs = append(txs, pending...)

		// Time floor: enforce minimum gap before creating the next block.
		// Bootstrap (h ≤ DifficultyWindow): full 60s gap (TEB).
		// Post-bootstrap: permanent 30s gap to prevent LWMA overshoot.
		{
			var minGap int64
			if height <= DifficultyWindow {
				minGap = TargetBlockTime
			} else {
				minGap = PostBootstrapMinGap
			}
			minTime := prev.Header.Timestamp + minGap
			if now := time.Now().Unix(); now < minTime {
				wait := time.Duration(minTime-now) * time.Second
				if height <= DifficultyWindow {
					fmt.Printf("[BOOTSTRAP] h=%d: waiting %v for time floor\n", height, wait.Round(time.Second))
				}
				select {
				case <-time.After(wait):
				case <-n.miningQuit:
					continue
				}
			}
		}
		if height == DifficultyWindow+1 {
			fmt.Printf("[BOOTSTRAP] complete at h=%d — permanent 30s floor active, LWMA running\n", height)
		}

		// Warn miners when a protocol upgrade is approaching.
		for ver, actHeight := range ForkActivations {
			if actHeight > height && actHeight-height <= 500 {
				fmt.Printf("[UPGRADE] Protocol v%d activates in %d blocks (at #%d) — update your node or you will fork off!\n",
					ver, actHeight-height, actHeight)
			}
		}

		diff := NextDifficulty(n.Blockchain, height)
		b := NewBlock(prev.Hash, height, diff, txs)
		if b.Header.Timestamp <= prev.Header.Timestamp {
			b.Header.Timestamp = prev.Header.Timestamp + 1
		}

		epochKey := n.epochKey(height)
		if err := MineBlock(b, n.Engine, epochKey, n.miningQuit); err != nil {
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

		// Broadcast the full block directly — no inv→getdata round-trip from seeds.
		// Using MsgBlock here (instead of MsgInv) closes the last remaining path
		// where a stale pendingInv entry or failed GetData could silently drop the
		// newly mined block before it reaches the other miner.
		blockMsg, err := NewMessage(n.Server.magic, MsgBlock, b)
		if err == nil {
			// If no connected peers at broadcast time, immediately reconnect to seeds
			// so the block reaches the network without waiting for the 30s ticker.
			if len(n.Server.ConnectedPeers()) == 0 {
				for _, seed := range n.Config.Seeds {
					if !n.Server.isOwnAddress(seed) && !n.Server.IsConnected(seed) {
						n.Server.ConnectToPeer(seed) //nolint:errcheck
					}
				}
				time.Sleep(2 * time.Second) // brief wait for handshake before broadcast
			}
			n.Server.Broadcast(blockMsg, nil)
		}

		fmt.Printf("⛏  Mined block %d — hash: %x\n", height, b.Hash)
		time.Sleep(10 * time.Millisecond) // brief yield between blocks for RPC goroutines
	}
}

// ── RandomX epoch key ─────────────────────────────────────────────────────────

// epochKey delegates to the Blockchain's canonical epoch-key derivation so
// the miner and the verifier always use the same seed for the same height.
func (n *Node) epochKey(height uint64) []byte {
	return n.Blockchain.epochKey(height)
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
