// p2p.go — Entire P2P networking layer for the Chakram node.
// All peer discovery, connections, and message routing lives here.
package main

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net"
	"sync"
	"time"
)

const (
	maxPeerViolations = 5
	banDuration       = 24 * time.Hour  // how long a banned address stays banned
)

// ── Message types ─────────────────────────────────────────────────────────────

type MessageType uint8

const (
	MsgVersion   MessageType = 1
	MsgVerAck    MessageType = 2
	MsgGetBlocks MessageType = 3
	MsgInv       MessageType = 4
	MsgGetData   MessageType = 5
	MsgBlock     MessageType = 6
	MsgTx        MessageType = 7
	MsgPing      MessageType = 8
	MsgPong      MessageType = 9
	MsgGetPeers  MessageType = 10
	MsgPeers     MessageType = 11
)

const maxPayloadBytes uint32 = 32 * 1024 * 1024 // 32 MB hard cap

// ── Payload structs ───────────────────────────────────────────────────────────

type VersionPayload struct {
	Version   uint32 `json:"version"`
	Height    uint64 `json:"height"`
	UserAgent string `json:"user_agent"`
	Timestamp int64  `json:"timestamp"`
	Nonce     uint64 `json:"nonce"`
}

// InvItem announces a single block (Type=1) or transaction (Type=2) by hash.
type InvItem struct {
	Type uint8  `json:"type"`
	Hash []byte `json:"hash"`
}

type InvPayload struct {
	Items []InvItem `json:"items"`
}

type GetBlocksPayload struct {
	FromHeight uint64 `json:"from_height"`
	Count      uint32 `json:"count"` // capped at 500 in handler
}

type GetDataPayload struct {
	Type uint8  `json:"type"`
	Hash []byte `json:"hash"`
}

type PeersPayload struct {
	Addresses []string `json:"addresses"`
}

// ── Message ───────────────────────────────────────────────────────────────────

// Message is the envelope for every Chakram P2P message.
type Message struct {
	Magic   [4]byte
	Type    MessageType
	Length  uint32
	Payload []byte
}

// NewMessage JSON-encodes payload and wraps it in a Message with correct Length.
func NewMessage(magic [4]byte, msgType MessageType, payload interface{}) (Message, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return Message{}, fmt.Errorf("marshal payload: %w", err)
	}
	return Message{
		Magic:   magic,
		Type:    msgType,
		Length:  uint32(len(data)),
		Payload: data,
	}, nil
}

// Encode serialises the message to wire format:
// [magic 4B] [type 1B] [length 4B big-endian] [payload]
func (m Message) Encode() ([]byte, error) {
	out := make([]byte, 0, 9+len(m.Payload))
	out = append(out, m.Magic[:]...)
	out = append(out, byte(m.Type))
	var lb [4]byte
	binary.BigEndian.PutUint32(lb[:], m.Length)
	out = append(out, lb[:]...)
	out = append(out, m.Payload...)
	return out, nil
}

// DecodeMessage reads one complete message from r.
// Validates the magic bytes and caps payload size at 32 MB.
func DecodeMessage(r io.Reader) (Message, error) {
	var msg Message

	if _, err := io.ReadFull(r, msg.Magic[:]); err != nil {
		return msg, fmt.Errorf("read magic: %w", err)
	}
	if msg.Magic != MagicMainnet && msg.Magic != MagicTestnet {
		return msg, fmt.Errorf("unknown network magic: %x", msg.Magic)
	}

	var typeBuf [1]byte
	if _, err := io.ReadFull(r, typeBuf[:]); err != nil {
		return msg, fmt.Errorf("read type: %w", err)
	}
	msg.Type = MessageType(typeBuf[0])

	var lenBuf [4]byte
	if _, err := io.ReadFull(r, lenBuf[:]); err != nil {
		return msg, fmt.Errorf("read length: %w", err)
	}
	msg.Length = binary.BigEndian.Uint32(lenBuf[:])
	if msg.Length > maxPayloadBytes {
		return msg, fmt.Errorf("payload size %d exceeds 32 MB cap", msg.Length)
	}

	if msg.Length > 0 {
		msg.Payload = make([]byte, msg.Length)
		if _, err := io.ReadFull(r, msg.Payload); err != nil {
			return msg, fmt.Errorf("read payload: %w", err)
		}
	}
	return msg, nil
}

// ── Peer ──────────────────────────────────────────────────────────────────────

// Peer represents a remote Chakram node.
type Peer struct {
	Address     string
	Conn        net.Conn
	Height      uint64
	Version     uint32
	Connected   bool
	LastSeen    time.Time
	violations  int         // protocol violations; banned at maxPeerViolations
	send        chan Message // outbound message queue
	versionSent bool        // true once we have sent our version to this peer
}

// NewPeer creates a Peer with a 100-message outbound buffer.
func NewPeer(address string, conn net.Conn) *Peer {
	return &Peer{
		Address:  address,
		Conn:     conn,
		LastSeen: time.Now(),
		send:     make(chan Message, 100),
	}
}

// Send enqueues msg for delivery. Returns an error if the queue is full (slow peer).
func (p *Peer) Send(msg Message) error {
	select {
	case p.send <- msg:
		return nil
	default:
		return fmt.Errorf("peer %s: outbound queue full", p.Address)
	}
}

// writeLoop drains the send channel, encodes each message, and writes it to the connection.
// Exits when the channel is closed or a write error occurs.
func (p *Peer) writeLoop() {
	for msg := range p.send {
		data, err := msg.Encode()
		if err != nil {
			continue
		}
		if _, err := p.Conn.Write(data); err != nil {
			return
		}
	}
}

// ── Server ────────────────────────────────────────────────────────────────────

// Server is the Chakram P2P node. It listens for incoming connections, manages
// peers, and routes messages to the appropriate handlers.
type Server struct {
	Blockchain   *Blockchain
	Mempool      *Mempool
	SyncManager  *SyncManager
	peers        map[string]*Peer
	banned       map[string]time.Time // IP address → ban expiry
	mu           sync.RWMutex
	port         int
	magic        [4]byte
	quit         chan struct{}
	listener     net.Listener
	listenAddr   string // canonical listen address set in Start()
	nonce        uint64 // random nonce to detect self-connections
	pendingInv   map[string]time.Time // hashes we have sent GetData for, awaiting block
	pendingInvMu sync.Mutex
}

// SetSyncManager wires a SyncManager into the server after construction.
func (s *Server) SetSyncManager(sm *SyncManager) {
	s.SyncManager = sm
}

// NewServer creates a Server. Use testnet=true to select testnet magic bytes.
func NewServer(bc *Blockchain, mp *Mempool, port int, testnet bool) *Server {
	magic := MagicMainnet
	if testnet {
		magic = MagicTestnet
	}
	return &Server{
		Blockchain: bc,
		Mempool:    mp,
		peers:      make(map[string]*Peer),
		banned:     make(map[string]time.Time),
		port:       port,
		magic:      magic,
		quit:       make(chan struct{}),
		nonce:      rand.Uint64(),
		pendingInv: make(map[string]time.Time),
	}
}

// isBanned reports whether addr is currently banned.
func (s *Server) isBanned(addr string) bool {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		host = addr
	}
	s.mu.RLock()
	expiry, ok := s.banned[host]
	s.mu.RUnlock()
	if !ok {
		return false
	}
	if time.Now().After(expiry) {
		s.mu.Lock()
		delete(s.banned, host)
		s.mu.Unlock()
		return false
	}
	return true
}

// banPeer immediately disconnects peer and bans its IP for banDuration.
func (s *Server) banPeer(p *Peer) {
	host, _, err := net.SplitHostPort(p.Address)
	if err != nil {
		host = p.Address
	}
	s.mu.Lock()
	s.banned[host] = time.Now().Add(banDuration)
	s.mu.Unlock()
	fmt.Printf("Peer %s banned for %s\n", p.Address, banDuration)
	s.RemovePeer(p)
}

// penalizePeer increments a peer's violation counter and bans it if the
// threshold is reached. Returns true when the peer was banned.
func (s *Server) penalizePeer(p *Peer) bool {
	p.violations++
	if p.violations >= maxPeerViolations {
		s.banPeer(p)
		return true
	}
	return false
}

// isOwnAddress returns true if addr is one of our own listening addresses.
// Checks both an exact match against listenAddr and whether the addr's host
// is a local network interface with our listen port.
func (s *Server) isOwnAddress(addr string) bool {
	if addr == s.listenAddr {
		return true
	}
	seedHost, seedPort, err := net.SplitHostPort(addr)
	if err != nil {
		return false
	}
	if seedPort != fmt.Sprintf("%d", s.port) {
		return false
	}
	ifaces, err := net.InterfaceAddrs()
	if err != nil {
		return false
	}
	for _, iface := range ifaces {
		var ip net.IP
		if ipnet, ok := iface.(*net.IPNet); ok {
			ip = ipnet.IP
		} else if ipaddr, ok := iface.(*net.IPAddr); ok {
			ip = ipaddr.IP
		}
		if ip != nil && ip.String() == seedHost {
			return true
		}
	}
	return false
}

// Start opens a TCP listener and spawns the accept and ping loops.
func (s *Server) Start() error {
	ln, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", s.port))
	if err != nil {
		return fmt.Errorf("listen :%d: %w", s.port, err)
	}
	s.listenAddr = fmt.Sprintf("0.0.0.0:%d", s.port)
	s.listener = ln

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				select {
				case <-s.quit:
					return
				default:
					continue
				}
			}
			go s.handleConnection(conn)
		}
	}()

	go s.pingLoop()
	return nil
}

// Stop signals all goroutines to exit, closes peer connections, and shuts the listener.
// Peer connections are closed concurrently and the call returns within 3 seconds.
func (s *Server) Stop() {
	close(s.quit)
	if s.listener != nil {
		s.listener.Close()
	}

	// Snapshot and clear the peers map atomically so RemovePeer can't race us.
	s.mu.Lock()
	peers := make([]*Peer, 0, len(s.peers))
	for _, p := range s.peers {
		peers = append(peers, p)
	}
	s.peers = make(map[string]*Peer)
	s.mu.Unlock()

	done := make(chan struct{})
	go func() {
		var wg sync.WaitGroup
		for _, p := range peers {
			wg.Add(1)
			go func(peer *Peer) {
				defer wg.Done()
				close(peer.send)
				peer.Conn.Close()
			}(p)
		}
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
	}
}

// ConnectToPeer dials an outbound connection, sends our version, and starts loops.
func (s *Server) ConnectToPeer(address string) error {
	conn, err := net.DialTimeout("tcp", address, 10*time.Second)
	if err != nil {
		return fmt.Errorf("dial %s: %w", address, err)
	}
	peer := NewPeer(address, conn)
	s.AddPeer(peer)
	go peer.writeLoop()
	go s.readLoop(peer)
	return s.sendVersion(peer)
}

// handleConnection manages a full inbound connection lifecycle.
func (s *Server) handleConnection(conn net.Conn) {
	addr := conn.RemoteAddr().String()
	if s.isBanned(addr) {
		conn.Close()
		return
	}
	peer := NewPeer(addr, conn)
	s.AddPeer(peer)
	go peer.writeLoop()
	if err := s.sendVersion(peer); err != nil {
		s.RemovePeer(peer)
		return
	}
	s.readLoop(peer)
}

// readLoop reads messages from peer until the connection drops or quit is signalled.
// Protocol violations increment the peer's violation counter; at the threshold
// the peer is banned.
func (s *Server) readLoop(peer *Peer) {
	defer s.RemovePeer(peer)
	for {
		select {
		case <-s.quit:
			return
		default:
		}
		msg, err := DecodeMessage(peer.Conn)
		if err != nil {
			return
		}
		peer.LastSeen = time.Now()
		if err := s.handleMessage(peer, msg); err != nil {
			if s.penalizePeer(peer) {
				return // peer was banned, exit loop
			}
		}
	}
}

// sendVersion sends our node's current version and chain height to peer.
func (s *Server) sendVersion(peer *Peer) error {
	vp := VersionPayload{
		Version:   Version,
		Height:    s.Blockchain.GetHeight(),
		UserAgent: "Chakram/1.0",
		Timestamp: time.Now().Unix(),
		Nonce:     s.nonce,
	}
	msg, err := NewMessage(s.magic, MsgVersion, vp)
	if err != nil {
		return err
	}
	peer.versionSent = true
	return peer.Send(msg)
}

// handleMessage dispatches an incoming message to its handler.
func (s *Server) handleMessage(peer *Peer, msg Message) error {
	switch msg.Type {
	case MsgVersion:
		return s.handleVersion(peer, msg)
	case MsgVerAck:
		return s.handleVerAck(peer, msg)
	case MsgGetBlocks:
		return s.handleGetBlocks(peer, msg)
	case MsgInv:
		return s.handleInv(peer, msg)
	case MsgGetData:
		return s.handleGetData(peer, msg)
	case MsgBlock:
		return s.handleBlock(peer, msg)
	case MsgTx:
		return s.handleTx(peer, msg)
	case MsgPing:
		return s.handlePing(peer)
	case MsgPong:
		peer.LastSeen = time.Now()
	case MsgGetPeers:
		return s.handleGetPeers(peer)
	case MsgPeers:
		return s.handlePeers(peer, msg)
	}
	return nil
}

// ── Message handlers ──────────────────────────────────────────────────────────

func (s *Server) handleVersion(peer *Peer, msg Message) error {
	var vp VersionPayload
	if err := json.Unmarshal(msg.Payload, &vp); err != nil {
		return fmt.Errorf("decode version: %w", err)
	}
	if vp.Nonce == s.nonce {
		fmt.Printf("[P2P] disconnecting self-connection from %s\n", peer.Address)
		return fmt.Errorf("self-connection detected")
	}
	peer.Height = vp.Height
	peer.Version = vp.Version

	// Send our version back if we haven't yet — ensures the peer always learns
	// our current height even when they initiated the connection.
	if !peer.versionSent {
		if err := s.sendVersion(peer); err != nil {
			return err
		}
	}

	ack, err := NewMessage(s.magic, MsgVerAck, struct{}{})
	if err != nil {
		return err
	}
	return peer.Send(ack)
}

func (s *Server) handleVerAck(peer *Peer, msg Message) error {
	peer.Connected = true
	if s.SyncManager != nil {
		s.SyncManager.OnPeerConnected(peer)
		return nil
	}
	// Fallback (no SyncManager): request blocks if peer is ahead.
	if peer.Height > s.Blockchain.GetHeight() {
		req, err := NewMessage(s.magic, MsgGetBlocks, GetBlocksPayload{
			FromHeight: s.Blockchain.GetHeight(),
			Count:      500,
		})
		if err != nil {
			return err
		}
		return peer.Send(req)
	}
	return nil
}

func (s *Server) handleGetBlocks(peer *Peer, msg Message) error {
	var gp GetBlocksPayload
	if err := json.Unmarshal(msg.Payload, &gp); err != nil {
		return fmt.Errorf("decode getblocks: %w", err)
	}
	count := gp.Count
	if count > 500 {
		count = 500
	}

	ourHeight := s.Blockchain.GetHeight()
	var items []InvItem
	for h := gp.FromHeight + 1; h <= ourHeight && uint32(len(items)) < count; h++ {
		b, err := s.Blockchain.GetBlock(h)
		if err != nil {
			break
		}
		items = append(items, InvItem{Type: 1, Hash: b.Hash})
	}
	if len(items) == 0 {
		return nil
	}
	inv, err := NewMessage(s.magic, MsgInv, InvPayload{Items: items})
	if err != nil {
		return err
	}
	return peer.Send(inv)
}

func (s *Server) handleInv(peer *Peer, msg Message) error {
	var inv InvPayload
	if err := json.Unmarshal(msg.Payload, &inv); err != nil {
		return fmt.Errorf("decode inv: %w", err)
	}
	for _, item := range inv.Items {
		switch item.Type {
		case 1: // block
			fmt.Printf("[P2P] handleInv from %s hash=%x\n", peer.Address, item.Hash[:8])
			if !s.Blockchain.HasBlock(item.Hash) {
				hashStr := fmt.Sprintf("%x", item.Hash)
				s.pendingInvMu.Lock()
				if _, exists := s.pendingInv[hashStr]; exists {
					s.pendingInvMu.Unlock()
					continue // already sent GetData for this hash, ignore duplicate
				}
				s.pendingInv[hashStr] = time.Now()
				s.pendingInvMu.Unlock()
				req, err := NewMessage(s.magic, MsgGetData, GetDataPayload{Type: 1, Hash: item.Hash})
				if err == nil {
					peer.Send(req) //nolint:errcheck
				}
			}
		case 2: // transaction
			if _, err := s.Mempool.Get(item.Hash); err != nil {
				req, err := NewMessage(s.magic, MsgGetData, GetDataPayload{Type: 2, Hash: item.Hash})
				if err == nil {
					peer.Send(req) //nolint:errcheck
				}
			}
		}
	}
	return nil
}

func (s *Server) handleGetData(peer *Peer, msg Message) error {
	var gd GetDataPayload
	if err := json.Unmarshal(msg.Payload, &gd); err != nil {
		return fmt.Errorf("decode getdata: %w", err)
	}
	fmt.Printf("[P2P] handleGetData from %s hash=%x type=%d\n", peer.Address, gd.Hash[:8], gd.Type)
	switch gd.Type {
	case 1: // block
		b, err := s.Blockchain.Storage.GetBlockByHash(gd.Hash)
		if err != nil {
			fmt.Printf("[P2P] handleGetData block not found hash=%x\n", gd.Hash[:8])
			return nil // don't have it
		}
		resp, err := NewMessage(s.magic, MsgBlock, b)
		if err != nil {
			return err
		}
		return peer.Send(resp)
	case 2: // transaction
		tx, err := s.Mempool.Get(gd.Hash)
		if err != nil {
			return nil
		}
		resp, err := NewMessage(s.magic, MsgTx, tx)
		if err != nil {
			return err
		}
		return peer.Send(resp)
	}
	return nil
}

func (s *Server) handleBlock(peer *Peer, msg Message) error {
	var b Block
	if err := json.Unmarshal(msg.Payload, &b); err != nil {
		return fmt.Errorf("decode block: %w", err)
	}
	if s.SyncManager != nil {
		s.SyncManager.OnBlockReceived(&b, peer)
		return nil
	}
	if err := s.Blockchain.AddBlock(&b); err != nil {
		return err
	}
	inv, err := NewMessage(s.magic, MsgInv, InvPayload{
		Items: []InvItem{{Type: 1, Hash: b.Hash}},
	})
	if err != nil {
		return err
	}
	s.Broadcast(inv, peer)
	return nil
}

func (s *Server) handleTx(peer *Peer, msg Message) error {
	var tx Transaction
	if err := json.Unmarshal(msg.Payload, &tx); err != nil {
		return fmt.Errorf("decode tx: %w", err)
	}
	if err := s.Mempool.Add(&tx); err != nil {
		return err
	}
	inv, err := NewMessage(s.magic, MsgInv, InvPayload{
		Items: []InvItem{{Type: 2, Hash: tx.TxID}},
	})
	if err != nil {
		return err
	}
	s.Broadcast(inv, peer)
	return nil
}

func (s *Server) handlePing(peer *Peer) error {
	pong, err := NewMessage(s.magic, MsgPong, struct{}{})
	if err != nil {
		return err
	}
	return peer.Send(pong)
}

func (s *Server) handleGetPeers(peer *Peer) error {
	s.mu.RLock()
	addrs := make([]string, 0, len(s.peers))
	for addr := range s.peers {
		addrs = append(addrs, addr)
	}
	s.mu.RUnlock()

	resp, err := NewMessage(s.magic, MsgPeers, PeersPayload{Addresses: addrs})
	if err != nil {
		return err
	}
	return peer.Send(resp)
}

func (s *Server) handlePeers(peer *Peer, msg Message) error {
	var pp PeersPayload
	if err := json.Unmarshal(msg.Payload, &pp); err != nil {
		return fmt.Errorf("decode peers: %w", err)
	}
	for _, addr := range pp.Addresses {
		if s.PeerCount() >= MaxPeers {
			break
		}
		if s.isBanned(addr) {
			continue
		}
		s.mu.RLock()
		_, exists := s.peers[addr]
		s.mu.RUnlock()
		if !exists {
			s.ConnectToPeer(addr) //nolint:errcheck — best-effort
		}
	}
	return nil
}

// ── Broadcast and peer management ─────────────────────────────────────────────

// Broadcast sends msg to all connected peers except exclude (may be nil).
// Snapshot the target list under RLock, then release before sending so the
// lock is not held during channel operations.
func (s *Server) Broadcast(msg Message, exclude *Peer) {
	s.mu.RLock()
	targets := make([]*Peer, 0, len(s.peers))
	for _, p := range s.peers {
		if !p.Connected {
			continue
		}
		if exclude != nil && p.Address == exclude.Address {
			continue
		}
		targets = append(targets, p)
	}
	s.mu.RUnlock()
	for _, p := range targets {
		p.Send(msg) //nolint:errcheck
	}
}

// AddPeer registers a peer under its address.
func (s *Server) AddPeer(p *Peer) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.peers[p.Address] = p
}

// RemovePeer unregisters and closes a peer's connection.
// s.mu must be released BEFORE calling OnPeerDisconnected — that callback calls
// ConnectedPeers() which acquires s.mu.RLock(), and Go's RWMutex is not
// reentrant: holding Lock() and then calling RLock() in the same goroutine
// deadlocks permanently.
func (s *Server) RemovePeer(p *Peer) {
	s.mu.Lock()
	delete(s.peers, p.Address)
	s.mu.Unlock()
	p.Conn.Close()
	if s.SyncManager != nil {
		s.SyncManager.OnPeerDisconnected(p)
	}
}

// PeerCount returns the total number of registered peers.
func (s *Server) PeerCount() int {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return len(s.peers)
}

// IsConnected reports whether a peer with the given address has completed the handshake.
func (s *Server) IsConnected(address string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	p, exists := s.peers[address]
	return exists && p.Connected
}

// ConnectedPeers returns a snapshot of all peers that have completed the handshake.
func (s *Server) ConnectedPeers() []*Peer {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]*Peer, 0, len(s.peers))
	for _, p := range s.peers {
		if p.Connected {
			out = append(out, p)
		}
	}
	return out
}

// ── Ping loop ─────────────────────────────────────────────────────────────────

// pingLoop sends a MsgPing to every peer every 30 seconds.
// Peers not seen within 90 seconds (3 missed pings) are disconnected.
func (s *Server) pingLoop() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-s.quit:
			return
		case <-ticker.C:
			ping, err := NewMessage(s.magic, MsgPing, struct{}{})
			if err != nil {
				continue
			}
			cutoff := time.Now().Add(-90 * time.Second)

			s.mu.RLock()
			var stale []*Peer
			for _, p := range s.peers {
				if p.LastSeen.Before(cutoff) {
					stale = append(stale, p)
				} else {
					p.Send(ping) //nolint:errcheck
				}
			}
			s.mu.RUnlock()

			for _, p := range stale {
				s.RemovePeer(p)
			}

			// Evict pendingInv entries older than 30 s so a missed block can be re-requested.
			invCutoff := time.Now().Add(-30 * time.Second)
			s.pendingInvMu.Lock()
			for k, t := range s.pendingInv {
				if t.Before(invCutoff) {
					delete(s.pendingInv, k)
				}
			}
			s.pendingInvMu.Unlock()
		}
	}
}
