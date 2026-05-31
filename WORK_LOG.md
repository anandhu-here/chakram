# Chakram Development Work Log

## Current State (v1.0.20 target)

### What works
- P2P network: 3 seed nodes running on GCP (e2-micro, relay-only)
- Self-connection detection via nonce in VersionPayload
- Broadcast storm prevention via pendingInv dedup map
- LWMA-3 difficulty adjustment (60-block window, no downward cap)
- Timestamp-Enforced Bootstrap (TEB) — hardware-agnostic genesis
- CGo RandomX engine on Mac (54 H/s) / pure-Go fallback on Linux (1 H/s, verification only)

### Seeds
| Node | IP | Role |
|------|----|------|
| seed-1 | 35.207.229.32 | relay, asia-south1 |
| seed-2 | 34.1.166.49 | relay, europe-west10 |
| seed-3 | 35.207.217.64 | relay, asia-south1 |

SSH user: `anandhusathe` on all VMs.

---

## CGo RandomX Switch (current task)

### Problem
- `git.gammaspectra.live/P2Pool/go-randomx` is a verification library — interprets RandomX VM instructions in pure Go
- Benchmarked at **1.28 H/s** on Mac i7-8850H
- At difficulty 19: 524,288 seconds per block = 6 days. Unusable.

### Solution
Split `pow.go` into three files:

| File | Build tag | Used when |
|------|-----------|-----------|
| `pow.go` | (none) | always — interface + MineBlock + VerifyBlock |
| `randomx_engine_cgo.go` | `cgo` | native Mac/Linux builds |
| `randomx_engine_pure.go` | `!cgo` | cross-compiled Linux (seed nodes, verification only) |

Pre-built static libraries vendored in `lib/`:
- `lib/randomx.h` — RandomX C header
- `lib/darwin_amd64/librandomx.a` — Mac Intel library
- `lib/linux_amd64/librandomx.a` — Linux AMD64 library

### Benchmarks
| Platform | Pure Go | CGo |
|----------|---------|-----|
| Mac i7-8850H | 1 H/s | 54 H/s (macOS JIT restricted) |
| GCP e2-micro | 1 H/s | 19 H/s (tiny shared vCPU) |
| Decent Linux (4 core) | 1 H/s | ~2,000-4,000 H/s (estimated) |
| Windows desktop | 1 H/s | ~500-3,000 H/s (estimated) |

### Why Mac is slow (54 H/s not 5000+)
macOS restricts JIT memory execution (`com.apple.security.cs.allow-jit` entitlement required).
RandomX JIT partially hobbled. Linux has no such restriction → full performance.

### Release workflow change
- Mac binary (`chakram-mac`): `go build` locally — CGo enabled by default ✓
- Linux binary (`chakram-linux`): `CGO_ENABLED=0 GOOS=linux go build` — pure Go fallback ✓
- Seeds don't mine, so pure Go verification at 1 H/s is fine for them
- Windows: to be done when user tests on Windows machine

---

## Timestamp-Enforced Bootstrap (TEB)

### Problem
InitialDifficulty had to be manually calibrated per hardware. Wrong value = chain broken.

### Solution (implemented in v1.0.19)
During the first `DifficultyWindow` (60) blocks:
- `blockchain.go AddBlock()`: rejects block if `timestamp < prev.timestamp + TargetBlockTime`
- `node.go mineLoop()`: miner waits until time floor before creating block

**Effect:** Any hardware finds blocks quickly at low difficulty, but blocks can only appear 60 seconds apart. LWMA gets clean data. Hardware-agnostic.

### Config changes
- `InitialDifficulty`: 19 → 4 (difficulty only needs to prevent trivial forgery; TEB controls rate)
- `MinDifficulty`: 1 → 4

---

## Key Bugs Fixed (History)

| Bug | Version | Fix |
|-----|---------|-----|
| Self-connection via GCP NAT | v1.0.16 | Nonce in VersionPayload |
| Broadcast storm | v1.0.16 | pendingInv dedup map (30s eviction) |
| Difficulty bootstrap collapse | v1.0.17 | Removed downward cap, raised InitialDifficulty |
| InitialDifficulty too low (1→13→19) | v1.0.18 | Raised to 19 (wrong — we measured wrong hashrate) |
| Wrong RandomX library (1 H/s) | v1.0.20 | Switched to CGo reference implementation |
| InitialDifficulty too high for real hashrate | v1.0.20 | Lowered to 4 (TEB handles rate, not difficulty) |

---

## Next Steps
- [ ] Test CGo build on Mac: confirm 54 H/s in logs
- [ ] Wipe chain, redeploy, mine first block
- [ ] Test on Windows machine for real mining hashrate
- [ ] If Windows gives good H/s: consider making a seed node a proper Linux miner (larger GCP instance)
- [ ] Consider adding Windows native CGo build to GitHub Actions

---

## Architecture Notes

### Difficulty system
```
Bootstrap (h ≤ 60):  TEB enforces 30s floor, difficulty = InitialDifficulty = 4
Post-bootstrap:       LWMA-3 adjusts per-block based on 60-block window, 15s permanent floor
Floor:               MinDifficulty = 4
Cap:                 4× per window upward, no downward cap
CoinbaseMaturity:    10 blocks (~5 min)
```

### Mining loop
```
mineLoop → wait for TEB floor → NextDifficulty → NewBlock → MineBlock → AddBlock → Broadcast
```

### P2P flow
```
MsgInv → pendingInv check → MsgGetData → MsgBlock → OnBlockReceived → AddBlock
```
