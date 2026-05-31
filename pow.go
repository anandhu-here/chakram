// pow.go — The entire proof-of-work engine for Chakram.
// All mining logic lives here. Nothing outside this file touches RandomX directly.
// The PoWEngine interface lets us swap implementations (e.g. CGo binding for servers)
// without changing any mining code.
package main

import (
	"bytes"
	"encoding/binary"
	"errors"
	"fmt"
	"runtime"
	"sync"
	"time"

	randomx "git.gammaspectra.live/P2Pool/go-randomx"
)

// ── Interface ─────────────────────────────────────────────────────────────────

// PoWEngine is the proof-of-work abstraction used by the miner.
// Init must be called once per block (keyed on the previous block hash) before
// calling Hash. Close releases any resources held by the implementation.
type PoWEngine interface {
	Hash(input []byte) []byte // runs PoW hash on input, returns 32-byte digest
	Init(key []byte) error    // initialises or re-keys the engine for a new block
	Close()                   // releases resources; call when mining is done
}

// ── RandomX implementation ────────────────────────────────────────────────────

// RandomXEngine implements PoWEngine using the pure-Go P2Pool RandomX library.
// It operates in light mode (cache-only, ~256 MB) which is required for mobile
// and sufficient for consensus verification on all platforms.
type RandomXEngine struct {
	mu      sync.RWMutex // RLock for key check; Lock for Hash and engine swap
	cache   *randomx.Randomx_Cache
	vm      *randomx.VM
	lastKey []byte // last key used for Init; skip re-init when unchanged
}

// NewRandomXEngine creates an uninitialised RandomXEngine.
// Call Init before using Hash.
func NewRandomXEngine() *RandomXEngine {
	return &RandomXEngine{}
}

// Init initialises the RandomX cache and VM using key as the seed.
// Uses double-checked locking: Argon2d runs with NO lock held, then a write
// lock re-checks the key before swapping. If another goroutine already swapped
// in the same epoch key while Argon2d was running, we discard our work and
// return immediately. The library is pure-Go so discarded cache/vm are GC'd —
// no explicit free calls needed.
//
// Full initialisation has two parts the library does NOT combine:
//  1. Randomx_init_cache — runs Argon2d to fill the memory blocks.
//  2. Build_SuperScalar_Program × RANDOMX_PROGRAM_COUNT — generates the
//     superscalar programs used by InitDatasetItem during hashing.
//     Skipping step 2 causes a nil-pointer panic at hash time.
func (e *RandomXEngine) Init(key []byte) error {
	// Fast path — read lock check.
	e.mu.RLock()
	sameKey := bytes.Equal(e.lastKey, key)
	e.mu.RUnlock()
	if sameKey {
		return nil
	}

	// Slow path — run Argon2d WITHOUT any lock.
	newCache := randomx.Randomx_alloc_cache(randomx.RANDOMX_FLAG_DEFAULT)
	if newCache == nil {
		return errors.New("randomx: failed to allocate cache")
	}
	newCache.Randomx_init_cache(key)

	gen := randomx.Init_Blake2Generator(key, 0)
	for i := 0; i < randomx.RANDOMX_PROGRAM_COUNT; i++ {
		newCache.Programs[i] = randomx.Build_SuperScalar_Program(gen)
	}

	newVM := newCache.VM_Initialize()
	if newVM == nil {
		return errors.New("randomx: failed to initialise VM")
	}

	// Write lock — double-check before swapping.
	e.mu.Lock()
	defer e.mu.Unlock()

	// Double-check: another goroutine may have already swapped in this key
	// while Argon2d was running. Discard our work if so — GC handles cleanup.
	if bytes.Equal(e.lastKey, key) {
		return nil
	}

	// We won the race — swap in the new engine.
	e.cache = newCache
	e.vm = newVM
	e.lastKey = make([]byte, len(key))
	copy(e.lastKey, key)
	return nil
}

// Hash runs the RandomX hash function on input and returns a 32-byte digest.
// Init must have been called before Hash.
func (e *RandomXEngine) Hash(input []byte) []byte {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.vm == nil {
		return make([]byte, 32)
	}
	out := make([]byte, 32)
	e.vm.CalculateHash(input, out)
	return out
}

// Close releases the RandomX resources. Always call this when mining finishes.
func (e *RandomXEngine) Close() {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.vm = nil
	e.cache = nil
}

// ── Header serialisation ──────────────────────────────────────────────────────

// serializeHeader encodes all BlockHeader fields to bytes in little-endian order.
// The byte sequence is what gets fed into the PoW hash function.
// Field order must match ComputeHash in block.go exactly so that hash verification
// is consistent across the network.
func serializeHeader(h BlockHeader) []byte {
	buf := new(bytes.Buffer)
	binary.Write(buf, binary.LittleEndian, h.Version)
	binary.Write(buf, binary.LittleEndian, h.Height)
	buf.Write(h.PreviousHash)
	buf.Write(h.MerkleRoot)
	binary.Write(buf, binary.LittleEndian, h.Timestamp)
	binary.Write(buf, binary.LittleEndian, h.Difficulty)
	binary.Write(buf, binary.LittleEndian, h.Nonce)
	return buf.Bytes()
}

// ── Mining ────────────────────────────────────────────────────────────────────

// VerifyBlock confirms that b.Hash is the authentic RandomX hash of b's header
// and that it satisfies the difficulty target. key is the epoch seed (same
// derivation as MineBlock). Returns nil on success, ErrInvalidPoW when the
// hash check fails, or a wrapped error when the engine fails to initialise.
func VerifyBlock(b *Block, engine PoWEngine, key []byte) error {
	if err := engine.Init(key); err != nil {
		return fmt.Errorf("engine init failed: %w", err)
	}
	data := serializeHeader(b.Header)
	expected := engine.Hash(data)
	if !bytes.Equal(expected, b.Hash) || !b.HashIsValid() {
		return ErrInvalidPoW
	}
	return nil
}

// MineBlock searches for a Nonce that makes b's hash satisfy the difficulty
// target, using engine for the RandomX hash function. key is the RandomX epoch
// seed — callers should derive it from the epoch boundary block hash so that
// Argon2d is only re-run once per epoch rather than once per block.
// quit is checked after every hash; closing it causes MineBlock to return
// immediately with an error so the caller's goroutine can exit cleanly.
//
// Steps:
//  1. Keys the engine to key (no-op when key matches the last Init call).
//  2. Serialises the header with the current Nonce and hashes it.
//  3. Stores the result in b.Hash and checks HashIsValid().
//  4. Increments Nonce and repeats until a valid hash is found or Nonce wraps.
//
// Returns nil when a valid hash is found; returns an error only if the nonce
// space is exhausted or quit is closed.
func MineBlock(b *Block, engine PoWEngine, key []byte, quit <-chan struct{}) error {
	if err := engine.Init(key); err != nil {
		return fmt.Errorf("mine: init engine: %w", err)
	}

	startNonce := b.Header.Nonce
	var hashCount uint64
	lastReport := time.Now()

	for {
		select {
		case <-quit:
			return errors.New("mining cancelled")
		default:
		}

		data := serializeHeader(b.Header)
		b.Hash = engine.Hash(data)
		hashCount++
		runtime.Gosched()

		if time.Since(lastReport) >= 30*time.Second {
			hps := float64(hashCount) / time.Since(lastReport).Seconds()
			fmt.Printf("[MINER] diff=%d hashrate=%.0f H/s\n", b.Header.Difficulty, hps)
			hashCount = 0
			lastReport = time.Now()
		}

		if b.HashIsValid() {
			return nil
		}

		b.Header.Nonce++
		if b.Header.Nonce == startNonce {
			return errors.New("mine: nonce exhausted — no valid hash found across full nonce space")
		}
	}
}
