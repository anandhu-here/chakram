# Chakram (CHK) — Complete Build Roadmap

## Vision
Chakram is a fast, CPU-mineable cryptocurrency rooted in Kerala's ancient Travancore trading legacy. Anyone can mine it — on a laptop, a desktop, a VM, or a spare Android phone plugged in at night. Transactions confirm in 60 seconds. The smallest unit is Cash. The network lives on every device that chooses to run it. It started with one genesis block containing a Malayalam message, mined by one person who believed a coin could have a soul.

---

## Coin Identity
| Property | Value |
|---|---|
| **Name** | Chakram |
| **Ticker** | CHK |
| **Smallest unit** | Cash (1 CHK = 1,000,000 Cash) |
| **Address prefix** | CK1 |
| **Genesis message** | ചക്രം — കേരളത്തിന്റെ പൈതൃകം, ഡിജിറ്റൽ യുഗത്തിൽ പുനർജനിക്കുന്നു |
| **Translation** | Chakram — The heritage of Kerala, reborn in the digital age |

---

## Economics
| Property | Value |
|---|---|
| **Total supply** | 44,800,000 CHK (ties to 448 Cash = 1 historical Travancore Rupee) |
| **Starting block reward** | 50 CHK |
| **Halving interval** | Every 1,051,200 blocks (~2 years at 60s block time) |
| **Minimum transaction fee** | 1,000 Cash |
| **Coinbase maturity** | 100 blocks |

---

## Network
| Property | Value |
|---|---|
| **Consensus** | Proof of Work — RandomX (ASIC resistant, CPU friendly) |
| **Block time** | 60 seconds |
| **Difficulty adjustment** | Every 2,016 blocks |
| **Max block size** | 1 MB |
| **Default port (mainnet)** | 8338 |
| **Default port (testnet)** | 18338 |
| **RPC port (mainnet)** | 8339 |
| **RPC port (testnet)** | 18339 |
| **Magic bytes (mainnet)** | CHAK (0x43 0x48 0x41 0x4B) |
| **Magic bytes (testnet)** | CHAT (0x43 0x48 0x41 0x54) |
| **Max peers** | 12 |
| **RandomX mode** | Light mode (256MB, ASIC resistant, Android compatible) |

---

## Historical Inspiration
The Chakram is a real historical coin from the Travancore kingdom of Kerala, India.

- The State of Travancore minted a special Travancore Rupee from 1600 to 1946
- 1 Travancore Rupee = 7 Panam = 28 Chakram = 448 Cash
- Different silver denominations were issued in 1901 (2 chakrams, 4 chakrams etc.)
- Gold coins were called "Anantharaman Panam" and "Ananthavarahan Panam"
- Kerala was a global trading hub — Roman, Arab, and Sri Lankan coins discovered on Kerala soil
- The word "cash" in English derives from the Tamil/Malayalam word "Kasu" — an ancient South Indian coin
- Chakram digital currency continues this 400-year-old trading legacy into the digital age

---

## Tech Stack
| Component | Technology |
|---|---|
| **Core blockchain** | Go |
| **Mining algorithm** | RandomX (pure Go — git.gammaspectra.live/P2Pool/go-randomx) |
| **Storage** | BadgerDB v4 (pure Go, no CGo, Android compatible) |
| **Block explorer backend** | Python (FastAPI) |
| **Block explorer frontend** | JavaScript |
| **Cloud infrastructure** | GCP (3 VMs — 1 seed node, 2 mining nodes) |
| **Mobile node** | Go compiled for ARM64 (Android) |

---

## File Structure
```
chakram/
├── config.go        — All constants (supply, ports, timing, genesis message)
├── block.go         — Block and BlockHeader structs, genesis block
├── blockchain.go    — Chain management, validation, AddBlock
├── storage.go       — BadgerDB persistence layer (single source of truth)
├── pow.go           — PoWEngine interface, RandomXEngine, MineBlock
├── transaction.go   — Transaction struct, UTXO model (Phase 3)
├── mempool.go       — Unconfirmed transaction pool (Phase 3)
├── wallet.go        — Keys, addresses, signing (Phase 4)
├── p2p.go           — Peer discovery, TCP connections, message protocol (Phase 5)
├── sync.go          — Chain syncing, IBD, orphan handling (Phase 6)
├── node.go          — Full node entrypoint, RPC, CLI (Phase 9)
├── main.go          — Entrypoint (temporary test, replaced in Phase 9)
├── vendor/          — Vendored dependencies (go mod vendor)
├── go.mod
├── go.sum
└── CHAKRAM_ROADMAP.md
```

---

## Build Roadmap

### ✅ Phase 0 — Setup (COMPLETE)
- Go installed (v1.24.3 darwin/amd64)
- GitHub repo created and pushed
- GCP project ready (₹60,000 credits)
- Project structure created
- Dependencies: BadgerDB v4, go-randomx (vendored)

### ✅ Phase 1 — Blockchain Core (COMPLETE)
**Files:** config.go, block.go, storage.go, blockchain.go

- Block and BlockHeader structs
- Double SHA256 block hashing
- Genesis block with Malayalam message hardcoded
- BadgerDB persistence — blocks stored by hash and height index
- Chain validation — PreviousHash linkage, sequential heights, timestamps
- Atomic storage writes — block hash + height index always in sync
- Chain tip tracking

**Milestone achieved:** Genesis block created, 3 test blocks mined, chain validates, persisted to disk and reloaded correctly.

**Genesis block hash:** 52ba5ed591ef0cf9e07226a0d1de5178f335a9acd953c5e160a5ded027855c0e

### ✅ Phase 2 — Proof of Work / RandomX (COMPLETE)
**Files:** pow.go, config.go updated, block.go updated

- PoWEngine interface — swappable mining backends
- RandomXEngine — pure Go RandomX implementation (P2Pool)
- RandomX light mode — 256MB, CPU friendly, Android ready
- serializeHeader — consistent little-endian header serialisation
- MineBlock — keys RandomX on PreviousHash, grinds nonce until HashIsValid
- Genesis block uses SHA256 (before RandomX is initialised)
- All subsequent blocks use RandomX
- Vendored under vendor/git.gammaspectra.live

**Milestone achieved:** 3 blocks mined with real RandomX (~1.5s each at MinDifficulty=1), chain validates.

### 🔲 Phase 3 — Transactions & UTXO
**Files to create:** transaction.go, mempool.go, storage.go updated

- Transaction struct — inputs, outputs, signatures, fees
- UTXO model — unspent transaction outputs (like Bitcoin)
- UTXO set in BadgerDB — key: utxo:{txid}:{index}
- Coinbase transaction — special first tx in every block, creates new CHK
- Transaction validation — verify inputs exist, are unspent, signatures valid
- Digital signatures — Ed25519
- Mempool — in-memory pool of unconfirmed transactions
- Transaction fees — collected by miner
- Merkle tree — hash all transactions into MerkleRoot in block header

**Milestone:** Create two test wallets, send CHK from one to another, mine a block containing the transaction, verify UTXO set updated correctly.

### 🔲 Phase 4 — Wallets & Keys
**Files to create:** wallet.go

- Ed25519 keypair generation
- Chakram address format — CK1 prefix, Base58Check encoding
- Wallet file — encrypted JSON storing keys locally
- BIP39 mnemonic — 12 word seed phrase backup
- Wallet CLI — generate, show address, show balance, send transaction
- Address validation

**Milestone:** Generate real Chakram wallet with CK1 address, back up with seed phrase, restore from seed phrase.

### 🔲 Phase 5 — P2P Network
**Files to create:** p2p.go

- TCP server — listen on port 8338 (mainnet) / 18338 (testnet)
- Peer struct — track connected peers, IP, chain height
- Handshake — exchange version, chain height, magic bytes on connect
- Message types — version, verack, getblocks, inv, getdata, block, tx, ping, pong
- Seed nodes — GCP node IPs hardcoded as entry points
- Peer discovery — ask peers for their peer lists
- Peer management — maintain 8-12 connections, drop dead peers
- IP banning — reject misbehaving peers

**Milestone:** Two nodes on different local ports find each other, handshake, exchange messages.

### 🔲 Phase 6 — Chain Syncing
**Files to create:** sync.go

- Block announcement — broadcast new block to all peers
- Block request — ask peers for missing blocks
- Initial block download (IBD) — new node syncs from genesis to tip
- Orphan block handling — store blocks whose parent hasn't arrived yet
- Chain reorganisation — switch to longer valid chain if found
- Sync progress display

**Milestone:** Fresh node connects to seed nodes and syncs entire chain automatically.

### 🔲 Phase 7 — Testnet Launch on GCP
- Network config flag — testnet vs mainnet
- Testnet genesis block (different from mainnet)
- Testnet magic bytes — CHAT
- Deploy 3 nodes on GCP VMs
- Mine testnet CHK
- Send transactions between nodes
- Stress test — many blocks, many transactions
- Fix all bugs found

**Milestone:** Three GCP nodes running, synced, mining. Send testnet CHK, confirms in ~60 seconds.

### 🔲 Phase 8 — Block Explorer
**Files to create:** explorer/ directory (Python + JS)

- Python indexer — reads blockchain via RPC, builds PostgreSQL database
- FastAPI backend — serves block and transaction data
- JS frontend — shows latest blocks, transactions, network stats
- Search — by block height, tx hash, address
- Address page — balance and transaction history
- Network stats — hashrate, difficulty, total supply mined, block time
- Deploy on GCP

**Milestone:** Block explorer live, anyone can look up any block or transaction.

### 🔲 Phase 9 — Node Release
**Files to create:** node.go, chakram-cli

- Clean up all code — comments, documentation
- RPC interface — getblock, sendtransaction, getbalance, getinfo
- CLI — chakram-cli commands
- Build binaries — Windows, Mac, Linux
- chakram.conf — documented config file
- README — how to run a node, how to mine
- Mining guide — written for non-technical people
- GitHub release with binaries

**Milestone:** A stranger downloads Chakram, follows README, runs a node, connects to seed nodes, starts mining without help.

### 🔲 Phase 10 — Mainnet Launch
- Mainnet genesis block — Malayalam message, mined by you, timestamped forever
- Announce GCP seed nodes
- Mine first 100 blocks to establish chain
- Public release — GitHub, Medium post, Kerala tech communities, crypto Twitter
- Block explorer pointing to mainnet

**Milestone:** Someone who isn't you mines a block. Chakram is real.

### 🔲 Phase 11 — Post Launch
- Faucet — sends small CHK to new users so they can try it
- Simple web wallet — browser based, no download needed
- Documentation site — everything about Chakram in one place
- Community — Telegram or Discord for miners and users
- Bug fixes

### 🔲 Phase 12 — Android Light Node + Mobile Miner
**The killer feature:**
> "Your old spare Android mines Chakram while you sleep."

- Go compiled for ARM64 — single command, no NDK needed (pure Go stack)
- Android app — thin wrapper running Go node as foreground service
- Foreground service — Android cannot kill it
- Wakelock — keeps CPU alive while plugged in
- Light node mode — stores headers only, not full chain
- Mining toggle — only mines when plugged in + on WiFi
- Simple UI — mining status, CHK earned, peers connected
- RandomX light mode — already configured (256MB, perfect for phones)

**Milestone:** Old spare Android phone plugged into WiFi mines real Chakram overnight.

---

## Key Design Decisions (Record of Why)

| Decision | Choice | Reason |
|---|---|---|
| Mining algorithm | RandomX (pure Go) | ASIC resistant, CPU friendly, compiles to ARM without CGo |
| Storage | BadgerDB v4 | Pure Go, no CGo, fast, Android compatible |
| UTXO vs Account model | UTXO | More secure, same as Bitcoin, no global state |
| Signature scheme | Ed25519 | Faster than ECDSA, more modern, smaller signatures |
| Block time | 60 seconds | Fast enough for everyday use, slow enough for network propagation |
| Total supply | 44,800,000 CHK | 448 × 100,000 — ties to historical 448 Cash = 1 Travancore Rupee |
| Address prefix | CK1 | Chakram, instantly recognisable |
| RandomX mode | Light (256MB) | Required for Android, still ASIC resistant |
| Halving interval | 1,051,200 blocks | ~2 years at 60s/block |
| Magic bytes | CHAK / CHAT | Chakram / Chakram Testnet, human readable |
| Height key encoding | Big-endian binary | Lexicographic order matches numeric order, enables range scans |

---

## Current Status
- **Phase 0:** ✅ Complete
- **Phase 1:** ✅ Complete — Blockchain core working, BadgerDB persistence, chain validation
- **Phase 2:** ✅ Complete — RandomX mining working, ~1.5s/block at MinDifficulty
- **Phase 3:** 🔲 Next — Transactions & UTXO
- **Genesis hash:** 52ba5ed591ef0cf9e07226a0d1de5178f335a9acd953c5e160a5ded027855c0e
- **Started:** May 28, 2026

---

## Notes for New Chat Sessions
If continuing this project in a new chat, share this file and say:
> "I am building Chakram (CHK), a cryptocurrency in Go. Here is my roadmap. I have completed Phases 0, 1, and 2. Continue from Phase 3."

The codebase is on GitHub. Current files: config.go, block.go, storage.go, blockchain.go, pow.go, main.go, vendor/, go.mod, go.sum.