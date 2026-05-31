//go:build cgo && ((darwin && amd64) || (linux && amd64) || (windows && amd64))

// randomx_engine_cgo.go — CGo RandomX engine using the C reference implementation.
// Gives ~50-4000 H/s depending on platform vs ~1 H/s for the pure-Go fallback.
// Used automatically when CGo is available (native builds).
// Cross-compiled Linux builds fall back to randomx_engine_pure.go.
package main

/*
#cgo CFLAGS: -I${SRCDIR}/lib
#cgo darwin,amd64  LDFLAGS: ${SRCDIR}/lib/darwin_amd64/librandomx.a  -lstdc++ -lpthread
#cgo linux,amd64   LDFLAGS: ${SRCDIR}/lib/linux_amd64/librandomx.a   -lstdc++ -lpthread
#cgo windows,amd64 LDFLAGS: ${SRCDIR}/lib/windows_amd64/librandomx.a -lstdc++ -lpthread

#include "randomx.h"
#include <stdlib.h>
*/
import "C"
import (
	"bytes"
	"errors"
	"sync"
	"unsafe"
)

// RandomXEngine wraps the C RandomX VM. One instance is shared between the
// miner and the block verifier (via Blockchain.SetVerifyEngine) so Argon2d
// is only re-run once per epoch boundary instead of twice.
type RandomXEngine struct {
	mu      sync.Mutex
	vm      *C.randomx_vm
	cache   *C.randomx_cache
	lastKey []byte
}

// NewRandomXEngine returns an uninitialised CGo RandomX engine.
func NewRandomXEngine() *RandomXEngine {
	return &RandomXEngine{}
}

// Init initialises (or re-keys) the RandomX cache and VM for the given epoch key.
// No-op when the key matches the last call — epoch boundaries are infrequent.
func (e *RandomXEngine) Init(key []byte) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	if bytes.Equal(e.lastKey, key) {
		return nil
	}

	flags := C.randomx_get_flags() | C.RANDOMX_FLAG_JIT

	newCache := C.randomx_alloc_cache(flags)
	if newCache == nil {
		return errors.New("randomx: failed to allocate cache")
	}
	C.randomx_init_cache(newCache, unsafe.Pointer(&key[0]), C.size_t(len(key)))

	newVM := C.randomx_create_vm(flags, newCache, nil)
	if newVM == nil {
		C.randomx_release_cache(newCache)
		return errors.New("randomx: failed to create VM")
	}

	// Release previous resources before swapping.
	if e.vm != nil {
		C.randomx_destroy_vm(e.vm)
	}
	if e.cache != nil {
		C.randomx_release_cache(e.cache)
	}

	e.vm = newVM
	e.cache = newCache
	e.lastKey = make([]byte, len(key))
	copy(e.lastKey, key)
	return nil
}

// Hash runs the RandomX hash and returns a 32-byte digest.
func (e *RandomXEngine) Hash(input []byte) []byte {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.vm == nil {
		return make([]byte, 32)
	}
	out := make([]byte, 32)
	C.randomx_calculate_hash(e.vm,
		unsafe.Pointer(&input[0]), C.size_t(len(input)),
		unsafe.Pointer(&out[0]))
	return out
}

// Close frees the C RandomX VM and cache.
func (e *RandomXEngine) Close() {
	e.mu.Lock()
	defer e.mu.Unlock()
	if e.vm != nil {
		C.randomx_destroy_vm(e.vm)
		e.vm = nil
	}
	if e.cache != nil {
		C.randomx_release_cache(e.cache)
		e.cache = nil
	}
}
