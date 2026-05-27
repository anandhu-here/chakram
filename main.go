// main.go — Phase 6 smoke test: three-node chain sync with SyncManager.
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
	fmt.Println("=== Chakram Phase 6 — Chain Sync Test ===")

	for _, dir := range []string{"./chakram-data-node1", "./chakram-data-node2", "./chakram-data-node3"} {
		os.RemoveAll(dir)
	}

	// ── 2. Node 1 ─────────────────────────────────────────────────────────────
	bc1, err := NewBlockchain("./chakram-data-node1")
	chk(err, "open bc1")
	mempool1 := NewMempool()
	server1 := NewServer(bc1, mempool1, 18500, true)
	sm1 := NewSyncManager(bc1, server1)
	server1.SetSyncManager(sm1)
	sm1.Start()
	chk(server1.Start(), "start server1")
	fmt.Println("Node 1 started")

	// ── 3. Mine 20 blocks on Node 1 ───────────────────────────────────────────
	miner, err := NewWallet()
	chk(err, "new miner wallet")
	engine := &RandomXEngine{}
	defer engine.Close()

	genesis, err := bc1.GetBlock(0)
	chk(err, "get genesis")

	for h := uint64(1); h <= 20; h++ {
		prev, err := bc1.GetLastBlock()
		chk(err, fmt.Sprintf("get last block at %d", h))

		cb := NewCoinbaseTransaction(miner.GetPubKeyHash(), h)
		b := NewBlock(prev.Hash, h, MinDifficulty, []*Transaction{cb})
		b.Header.Timestamp = genesis.Header.Timestamp + int64(h)*61

		chk(MineBlock(b, engine), fmt.Sprintf("mine block %d", h))
		chk(bc1.AddBlock(b), fmt.Sprintf("add block %d", h))

		if h%5 == 0 {
			fmt.Printf("  Mined block %d\n", h)
		}
	}
	fmt.Printf("Node 1 chain height: %d\n", bc1.GetHeight())

	// ── 4. Node 2 ─────────────────────────────────────────────────────────────
	bc2, err := NewBlockchain("./chakram-data-node2")
	chk(err, "open bc2")
	mempool2 := NewMempool()
	server2 := NewServer(bc2, mempool2, 18501, true)
	sm2 := NewSyncManager(bc2, server2)
	server2.SetSyncManager(sm2)
	sm2.Start()
	chk(server2.Start(), "start server2")
	fmt.Printf("Node 2 started — height: %d\n", bc2.GetHeight())

	// ── 5. Node 3 ─────────────────────────────────────────────────────────────
	bc3, err := NewBlockchain("./chakram-data-node3")
	chk(err, "open bc3")
	mempool3 := NewMempool()
	server3 := NewServer(bc3, mempool3, 18502, true)
	sm3 := NewSyncManager(bc3, server3)
	server3.SetSyncManager(sm3)
	sm3.Start()
	chk(server3.Start(), "start server3")
	fmt.Printf("Node 3 started — height: %d\n", bc3.GetHeight())

	// ── 6. Connect nodes ──────────────────────────────────────────────────────
	fmt.Println("\nConnecting nodes...")
	chk(server2.ConnectToPeer("127.0.0.1:18500"), "connect node2→node1")
	chk(server3.ConnectToPeer("127.0.0.1:18501"), "connect node3→node2")

	// ── 7. Wait for all nodes to sync ────────────────────────────────────────
	deadline := time.Now().Add(60 * time.Second)
	lastPrint := time.Now().Add(-3 * time.Second)
	for time.Now().Before(deadline) {
		if bc2.GetHeight() >= 20 && bc3.GetHeight() >= 20 {
			break
		}
		if time.Since(lastPrint) >= 3*time.Second {
			stateStr := func(s SyncState) string {
				switch s {
				case SyncIdle:
					return "idle"
				case SyncHeaders:
					return "headers"
				case SyncBlocks:
					return "syncing"
				case SyncComplete:
					return "complete"
				default:
					return "unknown"
				}
			}
			fmt.Printf("  Node 1: height=%d state=%s\n", bc1.GetHeight(), stateStr(sm1.GetState()))
			fmt.Printf("  Node 2: height=%d state=%s\n", bc2.GetHeight(), stateStr(sm2.GetState()))
			fmt.Printf("  Node 3: height=%d state=%s\n", bc3.GetHeight(), stateStr(sm3.GetState()))
			lastPrint = time.Now()
		}
		time.Sleep(time.Second)
	}

	// ── 8. Sync results ───────────────────────────────────────────────────────
	fmt.Println("\n=== Sync Results ===")
	fmt.Printf("Node 1 height: %d\n", bc1.GetHeight())
	fmt.Printf("Node 2 height: %d\n", bc2.GetHeight())
	fmt.Printf("Node 3 height: %d\n", bc3.GetHeight())
	fmt.Printf("All synced: %v\n", bc1.GetHeight() == 20 && bc2.GetHeight() == 20 && bc3.GetHeight() == 20)

	last1, err := bc1.GetLastBlock()
	chk(err, "get last block node1")
	last2, err := bc2.GetLastBlock()
	chk(err, "get last block node2")
	last3, err := bc3.GetLastBlock()
	chk(err, "get last block node3")

	tip1 := hex.EncodeToString(last1.Hash)
	tip2 := hex.EncodeToString(last2.Hash)
	tip3 := hex.EncodeToString(last3.Hash)
	fmt.Printf("Node 1 tip: %s\n", tip1)
	fmt.Printf("Node 2 tip: %s\n", tip2)
	fmt.Printf("Node 3 tip: %s\n", tip3)
	fmt.Printf("All tips match: %v\n", tip1 == tip2 && tip2 == tip3)

	// ── 9. Real-time propagation test ────────────────────────────────────────
	fmt.Println("\n=== Real-time Propagation Test ===")
	for h := uint64(21); h <= 23; h++ {
		prev, err := bc1.GetLastBlock()
		chk(err, fmt.Sprintf("get last block for block %d", h))

		cb := NewCoinbaseTransaction(miner.GetPubKeyHash(), h)
		b := NewBlock(prev.Hash, h, MinDifficulty, []*Transaction{cb})
		b.Header.Timestamp = genesis.Header.Timestamp + int64(h)*61

		chk(MineBlock(b, engine), fmt.Sprintf("mine block %d", h))
		chk(bc1.AddBlock(b), fmt.Sprintf("add block %d", h))

		inv, err := NewMessage(MagicTestnet, MsgInv, InvPayload{
			Items: []InvItem{{Type: 1, Hash: b.Hash}},
		})
		chk(err, "build inv")
		server1.Broadcast(inv, nil)

		deadline := time.Now().Add(15 * time.Second)
		for time.Now().Before(deadline) {
			if bc2.GetHeight() >= h && bc3.GetHeight() >= h {
				break
			}
			time.Sleep(200 * time.Millisecond)
		}
		fmt.Printf("Block %d propagated to all nodes: %v\n", h, bc2.GetHeight() >= h && bc3.GetHeight() >= h)
	}

	// ── 10. Orphan test ───────────────────────────────────────────────────────
	fmt.Println("\n=== Orphan Test ===")
	sm2.orphansMu.Lock()
	orphanCount := len(sm2.orphans)
	sm2.orphansMu.Unlock()
	fmt.Printf("Node 2 orphan count: %d\n", orphanCount)
	fmt.Printf("Node 2 sync status: %s\n", sm2.SyncStatus())

	// ── 11. Chain validation ──────────────────────────────────────────────────
	fmt.Println("\n--- Chain Validation ---")
	valid1, err := bc1.IsValid()
	chk(err, "validate bc1")
	valid2, err := bc2.IsValid()
	chk(err, "validate bc2")
	valid3, err := bc3.IsValid()
	chk(err, "validate bc3")
	fmt.Printf("Node 1 valid: %v\n", valid1)
	fmt.Printf("Node 2 valid: %v\n", valid2)
	fmt.Printf("Node 3 valid: %v\n", valid3)

	// ── 12. Sync status ───────────────────────────────────────────────────────
	fmt.Printf("\nNode 1: %s\n", sm1.SyncStatus())
	fmt.Printf("Node 2: %s\n", sm2.SyncStatus())
	fmt.Printf("Node 3: %s\n", sm3.SyncStatus())

	// ── 13. Shutdown ──────────────────────────────────────────────────────────
	fmt.Println("\nShutting down...")
	sm1.Stop()
	sm2.Stop()
	sm3.Stop()
	server1.Stop()
	server2.Stop()
	server3.Stop()
	bc1.Close()
	bc2.Close()
	bc3.Close()
	os.RemoveAll("./chakram-data-node1")
	os.RemoveAll("./chakram-data-node2")
	os.RemoveAll("./chakram-data-node3")
	fmt.Println("=== Phase 6 Complete ===")
	os.Exit(0)
}
