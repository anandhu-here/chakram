// sync.go — Production-grade chain synchronisation layer for Chakram.
// Sits on top of p2p.go and manages the full sync lifecycle including orphan handling.
package main

import (
	"bytes"
	"encoding/hex"
	"errors"
	"fmt"
	"sync"
	"time"
)

// ── Sync state ────────────────────────────────────────────────────────────────

type SyncState uint8

const (
	SyncIdle     SyncState = 0
	SyncHeaders  SyncState = 1
	SyncBlocks   SyncState = 2
	SyncComplete SyncState = 3
)

// ── Types ─────────────────────────────────────────────────────────────────────

type OrphanBlock struct {
	Block      *Block
	ReceivedAt time.Time
}

type SyncManager struct {
	blockchain    *Blockchain
	server        *Server
	orphans       map[string]*OrphanBlock // keyed by hex(hash)
	orphansMu     sync.Mutex
	state         SyncState
	stateMu       sync.RWMutex
	bestPeer      *Peer
	pendingBlocks map[string]time.Time // blocks requested, waiting for response
	pendingMu     sync.Mutex
	lastReorg     time.Time
	reorgMu       sync.Mutex
	quit          chan struct{}
}

// NewSyncManager creates a SyncManager wired to bc and server.
func NewSyncManager(bc *Blockchain, server *Server) *SyncManager {
	return &SyncManager{
		blockchain:    bc,
		server:        server,
		orphans:       make(map[string]*OrphanBlock),
		pendingBlocks: make(map[string]time.Time),
		quit:          make(chan struct{}),
	}
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

// Start launches the sync and orphan maintenance goroutines.
func (sm *SyncManager) Start() {
	go sm.syncLoop()
	go sm.orphanLoop()
}

// Stop signals all goroutines to exit.
func (sm *SyncManager) Stop() {
	close(sm.quit)
}

// ── State helpers ─────────────────────────────────────────────────────────────

func (sm *SyncManager) GetState() SyncState {
	sm.stateMu.RLock()
	defer sm.stateMu.RUnlock()
	return sm.state
}

func (sm *SyncManager) SetState(s SyncState) {
	sm.stateMu.Lock()
	defer sm.stateMu.Unlock()
	sm.state = s
}

// ── Sync loop ─────────────────────────────────────────────────────────────────

func (sm *SyncManager) syncLoop() {
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-sm.quit:
			return
		case <-ticker.C:
			sm.doSync()
		}
	}
}

func (sm *SyncManager) doSync() {
	peers := sm.server.ConnectedPeers()
	if len(peers) == 0 {
		sm.SetState(SyncIdle)
		sm.blockchain.SetSyncing(false, 0)
		return
	}

	ourHeight := sm.blockchain.GetHeight()

	// Select best peer: skip height=0 (version exchange still in flight)
	// and skip peers that are behind us (they have nothing to give us).
	var best *Peer
	for _, p := range peers {
		if p.Height == 0 {
			continue
		}
		if p.Height < ourHeight {
			continue
		}
		if best == nil || p.Height > best.Height {
			best = p
		}
	}

	if best == nil {
		// No peer is ahead of us — we are at the tip.
		sm.SetState(SyncComplete)
		sm.blockchain.SetSyncing(false, 0)
		return
	}

	sm.bestPeer = best
	sm.SetState(SyncBlocks)
	sm.blockchain.SetSyncing(true, best.Height)

	req, err := NewMessage(sm.server.magic, MsgGetBlocks, GetBlocksPayload{
		FromHeight: ourHeight,
		Count:      500,
	})
	if err != nil {
		return
	}
	best.Send(req) //nolint:errcheck
}

// ── Block handling ────────────────────────────────────────────────────────────

// OnBlockReceived is called by p2p handleBlock instead of bc.AddBlock directly.
// It handles orphans, broadcasts new blocks, and updates sync state.
func (sm *SyncManager) OnBlockReceived(b *Block, from *Peer) {
	// Already have this block — genesis re-send, duplicate broadcast, etc.
	if sm.blockchain.HasBlock(b.Hash) {
		return
	}

	// A genesis block with an unknown hash means a different chain entirely.
	if b.Header.Height == 0 {
		ours, err := sm.blockchain.GetBlock(0)
		if err != nil || !bytes.Equal(ours.Hash, b.Hash) {
			fmt.Printf("peer %s sent genesis with wrong hash — different chain, rejecting\n", peerAddr(from))
		}
		return
	}

	// Reorg rate limiting: a block triggers a reorg when its parent is not
	// the current tip but its height exceeds ours. Limit to one reorg per 2s
	// so a fast miner cannot flood seeds with reorganisation work.
	wouldReorg := !bytes.Equal(b.Header.PreviousHash, sm.blockchain.GetTip()) &&
		b.Header.Height > sm.blockchain.GetHeight()
	if wouldReorg {
		sm.reorgMu.Lock()
		if time.Since(sm.lastReorg) < 2*time.Second {
			sm.reorgMu.Unlock()
			return
		}
		sm.lastReorg = time.Now()
		sm.reorgMu.Unlock()
	}

	if err := sm.blockchain.AddBlock(b); err != nil {
		if isOrphanError(err) {
			sm.AddOrphan(b)
			if from != nil {
				sm.RequestBlock(b.Header.PreviousHash, from)
			}
		} else if isPoWError(err) && from != nil && !sm.blockchain.IsSyncing() {
			// Only penalize for a cryptographically proven fake hash — never for
			// local state issues (empty chain after wipe, still syncing, db errors).
			fmt.Printf("peer %s sent block with invalid PoW at height %d — penalizing\n",
				peerAddr(from), b.Header.Height)
			sm.server.penalizePeer(from)
		} else {
			fmt.Printf("block %d from peer %s rejected (local state): %v\n",
				b.Header.Height, peerAddr(from), err)
		}
		return
	}

	// Keep peer.Height current so doSync has accurate data.
	if from != nil && b.Header.Height > from.Height {
		from.Height = b.Header.Height
	}

	hashHex := hex.EncodeToString(b.Hash)
	sm.pendingMu.Lock()
	delete(sm.pendingBlocks, hashHex)
	sm.pendingMu.Unlock()

	sm.ProcessOrphans(b.Hash)

	inv, err := NewMessage(sm.server.magic, MsgInv, InvPayload{
		Items: []InvItem{{Type: 1, Hash: b.Hash}},
	})
	if err == nil {
		sm.server.Broadcast(inv, from)
	}

	if sm.bestPeer != nil && sm.blockchain.GetHeight() >= sm.bestPeer.Height {
		sm.SetState(SyncComplete)
		sm.blockchain.SetSyncing(false, 0)
	}
}

// isOrphanError returns true when AddBlock fails because the block's parent
// is not yet stored locally (block arrived out of order or from a fork).
func isOrphanError(err error) bool {
	return errors.Is(err, ErrOrphanBlock)
}

// isPoWError returns true when AddBlock rejects a block because its RandomX
// hash does not match the hash claimed in the block header.
func isPoWError(err error) bool {
	return errors.Is(err, ErrInvalidPoW)
}

// ── Orphan management ─────────────────────────────────────────────────────────

// AddOrphan inserts b into the orphan pool, evicting blocks older than 10 minutes.
func (sm *SyncManager) AddOrphan(b *Block) {
	hashHex := hex.EncodeToString(b.Hash)
	cutoff := time.Now().Add(-10 * time.Minute)

	sm.orphansMu.Lock()
	defer sm.orphansMu.Unlock()

	for k, o := range sm.orphans {
		if o.ReceivedAt.Before(cutoff) {
			delete(sm.orphans, k)
		}
	}

	if _, exists := sm.orphans[hashHex]; !exists {
		sm.orphans[hashHex] = &OrphanBlock{Block: b, ReceivedAt: time.Now()}
	}
}

// ProcessOrphans checks whether any orphan's parent is newBlockHash, and if so
// tries to add it. The process repeats recursively until no more orphans connect.
func (sm *SyncManager) ProcessOrphans(newBlockHash []byte) {
	parentHex := hex.EncodeToString(newBlockHash)

	sm.orphansMu.Lock()
	var ready []*Block
	for k, o := range sm.orphans {
		if hex.EncodeToString(o.Block.Header.PreviousHash) == parentHex {
			ready = append(ready, o.Block)
			delete(sm.orphans, k)
		}
	}
	sm.orphansMu.Unlock()

	for _, b := range ready {
		sm.OnBlockReceived(b, nil)
	}
}

// orphanLoop periodically evicts stale orphans (runs every 60 seconds).
func (sm *SyncManager) orphanLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-sm.quit:
			return
		case <-ticker.C:
			sm.evictOldOrphans()
		}
	}
}

func (sm *SyncManager) evictOldOrphans() {
	cutoff := time.Now().Add(-10 * time.Minute)
	sm.orphansMu.Lock()
	defer sm.orphansMu.Unlock()

	for k, o := range sm.orphans {
		if o.ReceivedAt.Before(cutoff) {
			delete(sm.orphans, k)
		}
	}
}

// ── Pending block tracking ────────────────────────────────────────────────────

// RequestBlock sends a MsgGetData for hash to peer and records it as pending.
func (sm *SyncManager) RequestBlock(hash []byte, from *Peer) {
	if from == nil {
		return
	}
	hashHex := hex.EncodeToString(hash)
	sm.pendingMu.Lock()
	sm.pendingBlocks[hashHex] = time.Now()
	sm.pendingMu.Unlock()

	req, err := NewMessage(sm.server.magic, MsgGetData, GetDataPayload{Type: 1, Hash: hash})
	if err != nil {
		return
	}
	from.Send(req) //nolint:errcheck
}

// CleanPendingBlocks removes request entries older than 30 seconds (timed out).
func (sm *SyncManager) CleanPendingBlocks() {
	cutoff := time.Now().Add(-30 * time.Second)
	sm.pendingMu.Lock()
	defer sm.pendingMu.Unlock()
	for k, t := range sm.pendingBlocks {
		if t.Before(cutoff) {
			delete(sm.pendingBlocks, k)
		}
	}
}

// ── Peer events ───────────────────────────────────────────────────────────────

// OnPeerConnected is called after the handshake completes.
// Always sends MsgGetBlocks immediately — peer.Height at handshake time may be
// stale (e.g. miner was at 0 when we connected but has since mined many blocks).
func (sm *SyncManager) OnPeerConnected(p *Peer) {
	ourHeight := sm.blockchain.GetHeight()

	if p.Height > ourHeight {
		sm.bestPeer = p
		sm.SetState(SyncBlocks)
		sm.blockchain.SetSyncing(true, p.Height)
	}

	// Send MsgGetBlocks unconditionally: peer height is only known at handshake
	// time. The peer may have mined more blocks since then.
	req, err := NewMessage(sm.server.magic, MsgGetBlocks, GetBlocksPayload{
		FromHeight: ourHeight,
		Count:      500,
	})
	if err != nil {
		return
	}
	p.Send(req) //nolint:errcheck
}

// OnPeerDisconnected is called when a peer drops.
// If it was our best peer we pick the next best, or fall back to SyncIdle.
func (sm *SyncManager) OnPeerDisconnected(p *Peer) {
	if sm.bestPeer == nil || sm.bestPeer.Address != p.Address {
		return
	}
	peers := sm.server.ConnectedPeers()
	if len(peers) == 0 {
		sm.bestPeer = nil
		sm.SetState(SyncIdle)
		sm.blockchain.SetSyncing(false, 0)
		return
	}
	var next *Peer
	for _, peer := range peers {
		if next == nil || peer.Height > next.Height {
			next = peer
		}
	}
	sm.bestPeer = next
}

// ── Status ────────────────────────────────────────────────────────────────────

// peerAddr returns a short address string safe to call with a nil peer.
func peerAddr(p *Peer) string {
	if p == nil {
		return "<nil>"
	}
	return p.Address
}

// SyncStatus returns a human-readable sync status string.
func (sm *SyncManager) SyncStatus() string {
	peers := sm.server.ConnectedPeers()
	if len(peers) == 0 {
		return "Idle — no peers"
	}

	ourHeight := sm.blockchain.GetHeight()
	if sm.GetState() == SyncComplete {
		return fmt.Sprintf("Synced — height %d", ourHeight)
	}

	var bestHeight uint64
	for _, p := range peers {
		if p.Height > bestHeight {
			bestHeight = p.Height
		}
	}

	if bestHeight == 0 || ourHeight >= bestHeight {
		return fmt.Sprintf("Synced — height %d", ourHeight)
	}

	pct := ourHeight * 100 / bestHeight
	return fmt.Sprintf("Syncing — height %d / %d (%d%%)", ourHeight, bestHeight, pct)
}
