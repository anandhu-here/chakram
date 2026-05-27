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
	cache *randomx.Randomx_Cache
	vm    *randomx.VM
}

// NewRandomXEngine creates an uninitialised RandomXEngine.
// Call Init before using Hash.
func NewRandomXEngine() *RandomXEngine {
	return &RandomXEngine{}
}

// Init initialises the RandomX cache and VM using key as the seed.
// For Chakram, key is always the previous block's hash, so the PoW
// function changes with every block — preventing pre-computation attacks.
// This is the expensive step (~seconds on first call); subsequent calls
// with the same key reuse the existing cache if possible.
//
// Full initialisation has two parts the library does NOT combine:
//  1. Randomx_init_cache — runs Argon2d to fill the memory blocks.
//  2. Build_SuperScalar_Program × RANDOMX_PROGRAM_COUNT — generates the
//     superscalar programs used by InitDatasetItem during hashing.
//     Skipping step 2 causes a nil-pointer panic at hash time.
func (e *RandomXEngine) Init(key []byte) error {
	cache := randomx.Randomx_alloc_cache(randomx.RANDOMX_FLAG_DEFAULT)
	if cache == nil {
		return errors.New("randomx: failed to allocate cache")
	}
	cache.Randomx_init_cache(key)

	// Build the superscalar programs required for dataset item generation.
	// nonce 0 matches the reference RandomX implementation.
	gen := randomx.Init_Blake2Generator(key, 0)
	for i := 0; i < randomx.RANDOMX_PROGRAM_COUNT; i++ {
		cache.Programs[i] = randomx.Build_SuperScalar_Program(gen)
	}

	vm := cache.VM_Initialize()
	if vm == nil {
		return errors.New("randomx: failed to initialise VM")
	}

	e.cache = cache
	e.vm = vm
	return nil
}

// Hash runs the RandomX hash function on input and returns a 32-byte digest.
// Init must have been called before Hash.
func (e *RandomXEngine) Hash(input []byte) []byte {
	out := make([]byte, 32)
	e.vm.CalculateHash(input, out)
	return out
}

// Close releases the RandomX resources. Always call this when mining finishes.
func (e *RandomXEngine) Close() {
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

// MineBlock searches for a Nonce that makes b's hash satisfy the difficulty
// target, using engine for the RandomX hash function.
//
// Steps:
//  1. Keys the engine to the previous block hash (cheap after first Init).
//  2. Serialises the header with the current Nonce and hashes it.
//  3. Stores the result in b.Hash and checks HashIsValid().
//  4. Increments Nonce and repeats until a valid hash is found or Nonce wraps.
//
// Returns nil when a valid hash is found; returns an error only if the nonce
// space is exhausted (astronomically unlikely in practice).
func MineBlock(b *Block, engine PoWEngine) error {
	if err := engine.Init(b.Header.PreviousHash); err != nil {
		return fmt.Errorf("mine: init engine: %w", err)
	}

	startNonce := b.Header.Nonce
	for {
		data := serializeHeader(b.Header)
		b.Hash = engine.Hash(data)

		if b.HashIsValid() {
			return nil
		}

		b.Header.Nonce++
		// Detect full uint64 wrap-around.
		if b.Header.Nonce == startNonce {
			return errors.New("mine: nonce exhausted — no valid hash found across full nonce space")
		}
	}
}
