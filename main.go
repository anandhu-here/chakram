// main.go — Phase 5 smoke test: two-node P2P sync over real TCP.
package main

import (
	"encoding/hex"
	"fmt"
	"os"
	"time"
)

func chk(err error, msg string) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "FATAL %s: %v\n", msg, err)
		os.Exit(1)
	}
}

func main() {
	fmt.Println("=== Chakram Phase 5 — P2P Network Test ===")

	// Wipe any stale data from previous runs.
	os.RemoveAll("./chakram-data-node1")
	os.RemoveAll("./chakram-data-node2")
	defer os.RemoveAll("./chakram-data-node1")
	defer os.RemoveAll("./chakram-data-node2")

	// ── 2. Node 1 ─────────────────────────────────────────────────────────────
	bc1, err := NewBlockchain("./chakram-data-node1")
	chk(err, "open bc1")
	mempool1 := NewMempool()
	server1 := NewServer(bc1, mempool1, 18500, true)
	chk(server1.Start(), "start server1")
	fmt.Printf("\nNode 1 started on port 18500, height: %d\n", bc1.GetHeight())

	// ── 3. Node 2 ─────────────────────────────────────────────────────────────
	bc2, err := NewBlockchain("./chakram-data-node2")
	chk(err, "open bc2")
	mempool2 := NewMempool()
	server2 := NewServer(bc2, mempool2, 18501, true)
	chk(server2.Start(), "start server2")
	fmt.Printf("Node 2 started on port 18501, height: %d\n", bc2.GetHeight())

	// ── 4. Mine 5 blocks on Node 1 ───────────────────────────────────────────
	fmt.Println("\n--- Mining 5 blocks on Node 1 ---")
	wallet1, err := NewWallet()
	chk(err, "new wallet")

	engine := &RandomXEngine{}
	defer engine.Close()

	genesis, err := bc1.GetBlock(0)
	chk(err, "get genesis")

	for h := uint64(1); h <= 5; h++ {
		prev, err := bc1.GetLastBlock()
		chk(err, fmt.Sprintf("get last block at %d", h))

		cb := NewCoinbaseTransaction(wallet1.GetPubKeyHash(), h)
		b := NewBlock(prev.Hash, h, MinDifficulty, []*Transaction{cb})
		b.Header.Timestamp = genesis.Header.Timestamp + int64(h)*61

		chk(MineBlock(b, engine), fmt.Sprintf("mine block %d", h))
		chk(bc1.AddBlock(b), fmt.Sprintf("add block %d", h))

		fmt.Printf("  Block %d — %s\n", h, hex.EncodeToString(b.Hash))
	}
	fmt.Printf("\nNode 1 chain height: %d\n", bc1.GetHeight())
	fmt.Printf("Node 2 chain height: %d (not synced yet)\n", bc2.GetHeight())

	// ── 5. Connect Node 2 → Node 1 ───────────────────────────────────────────
	fmt.Println("\nConnecting Node 2 to Node 1...")
	chk(server2.ConnectToPeer("127.0.0.1:18500"), "connect peer")

	// ── 6. Wait for sync ──────────────────────────────────────────────────────
	deadline := time.Now().Add(30 * time.Second)
	lastPrint := time.Now().Add(-2 * time.Second) // trigger immediately
	synced := false
	for time.Now().Before(deadline) {
		if bc2.GetHeight() >= 5 {
			synced = true
			break
		}
		if time.Since(lastPrint) >= 2*time.Second {
			fmt.Printf("  Waiting for sync... Node 2 height: %d\n", bc2.GetHeight())
			lastPrint = time.Now()
		}
		time.Sleep(500 * time.Millisecond)
	}
	if !synced {
		fmt.Println("WARNING: sync timed out after 30s")
	}

	// ── 7. Sync results ───────────────────────────────────────────────────────
	fmt.Println("\n=== Sync Results ===")
	fmt.Printf("Node 1 height: %d\n", bc1.GetHeight())
	fmt.Printf("Node 2 height: %d\n", bc2.GetHeight())
	fmt.Printf("Heights match: %v\n", bc1.GetHeight() == bc2.GetHeight())

	last1, err := bc1.GetLastBlock()
	chk(err, "get last block node1")
	last2, err := bc2.GetLastBlock()
	chk(err, "get last block node2")

	tip1 := hex.EncodeToString(last1.Hash)
	tip2 := hex.EncodeToString(last2.Hash)
	fmt.Printf("Node 1 tip: %s\n", tip1)
	fmt.Printf("Node 2 tip: %s\n", tip2)
	fmt.Printf("Tips match: %v\n", tip1 == tip2)

	// ── 8. Block propagation test (mine block 6, broadcast Inv) ──────────────
	fmt.Println("\n=== Block Propagation Test ===")
	prev, err := bc1.GetLastBlock()
	chk(err, "get last block for block 6")

	cb6 := NewCoinbaseTransaction(wallet1.GetPubKeyHash(), 6)
	block6 := NewBlock(prev.Hash, 6, MinDifficulty, []*Transaction{cb6})
	block6.Header.Timestamp = genesis.Header.Timestamp + 6*61

	chk(MineBlock(block6, engine), "mine block 6")
	chk(bc1.AddBlock(block6), "add block 6")
	fmt.Printf("Block 6 mined on Node 1: %s\n", hex.EncodeToString(block6.Hash))

	// Announce block 6 to all connected peers.
	inv, err := NewMessage(MagicTestnet, MsgInv, InvPayload{
		Items: []InvItem{{Type: 1, Hash: block6.Hash}},
	})
	chk(err, "build inv")
	server1.Broadcast(inv, nil)

	// Poll for propagation.
	deadline = time.Now().Add(10 * time.Second)
	for time.Now().Before(deadline) {
		if bc2.GetHeight() >= 6 {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	fmt.Printf("Block 6 propagated to Node 2: %v\n", bc2.GetHeight() == 6)

	// ── 9. Peer counts ────────────────────────────────────────────────────────
	fmt.Printf("\nNode 1 peers: %d\n", server1.PeerCount())
	fmt.Printf("Node 2 peers: %d\n", server2.PeerCount())

	// ── 10. Chain validation ──────────────────────────────────────────────────
	fmt.Println("\n--- Chain Validation ---")
	valid1, err := bc1.IsValid()
	chk(err, "validate bc1")
	valid2, err := bc2.IsValid()
	chk(err, "validate bc2")
	fmt.Printf("Node 1 chain valid: %v\n", valid1)
	fmt.Printf("Node 2 chain valid: %v\n", valid2)

	// ── 11. Cleanup ───────────────────────────────────────────────────────────
	server1.Stop()
	server2.Stop()
	bc1.Close()
	bc2.Close()

	fmt.Println("\n=== Phase 5 Complete ===")
}
