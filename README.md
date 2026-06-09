# ⬡ Chakram (CHK)

**Website:** https://chakram.one · **Explorer:** https://chakram.one · **Download:** https://chakram.one/download

> ചക്രം — The heritage of Kerala, reborn in the digital age.

Chakram is a CPU-mineable UTXO cryptocurrency built from scratch in Go, inspired by the ancient Travancore kingdom coins of Kerala, India. Not a fork — every line is original. Anyone can mine it on a regular laptop or desktop.

> ⚠️ **Code signing:** Mac and Windows binaries are not yet code-signed. macOS users: right-click → Open → Open. Windows users: More info → Run anyway. This is normal for open-source software without paid certificates.

## Features

- **CPU Mining** — RandomX algorithm, ASIC-resistant. Full mode uses a 2 GB dataset for ~10× the hashrate of light mode.
- **Fast blocks** — 30 second target, LWMA-3 difficulty adjustment.
- **Ed25519 signatures** — fast, small, secure. BIP39 12-word mnemonic recovery.
- **UTXO model** — same model as Bitcoin. Full transaction index.
- **Decentralised** — P2P network with DNS seeds, peer exchange, ban list, and address book persistence.
- **Built-in explorer** — block explorer and wallet served directly from the node binary.
- **Cultural heritage** — Named after the real Travancore Chakram coin. 1 CHK = 1,000,000 Cash. The word "cash" comes from the Malayalam "Kasu" (കാശ്).

## Get Started

The easiest way is the **GUI desktop app** — download for Windows, Mac, or Linux at [chakram.one/download](https://chakram.one/download). Opens straight to a wallet and one-click mining.

For CLI, download the latest binary from [Releases](https://github.com/anandhu-here/chakram/releases).

### macOS (CLI)

```bash
cd ~/Downloads
chmod +x chakram-mac
xattr -d com.apple.quarantine chakram-mac
./chakram-mac node
```

### Windows (CLI)

```
chakram-windows.exe node
```

If SmartScreen appears: **More info → Run anyway**.

### Linux (CLI)

```bash
chmod +x chakram-linux
./chakram-linux node
```

## Quick Start

### Run a node

```bash
./chakram node                  # sync + block explorer at http://127.0.0.1:8339
./chakram node --mine           # sync + mine
./chakram node --rpc-public     # expose RPC on 0.0.0.0 (for external access)
./chakram node --seed-mode      # infrastructure seed (125 peers, public RPC)
```

On first start the node:
1. Generates a wallet and prints your CK1 address
2. Connects to the Chakram network via DNS seeds
3. Syncs the chain
4. Starts mining if `--mine` is set

**Back up your 12-word mnemonic immediately — it is only shown once.**

### Mine Chakram

```bash
./chakram node --mine
./chakram node --mine --mineraddress CK1YourAddress   # pay rewards to a different address
./chakram node --mine --threads 4                     # use 4 CPU threads
```

Mining requires at least 1 connected peer and a fully synced chain. Rewards go directly to your wallet.

### Wallet commands

```bash
./chakram wallet address                                       # show your CK1 address
./chakram wallet balance                                       # show balance in CHK
./chakram send CK1RecipientAddress 10.5                        # send 10.5 CHK
./chakram wallet new                                           # generate a new wallet
./chakram wallet recover --mnemonic "word1 word2 ... word12"   # recover from mnemonic
```

### Block explorer

Once your node is running:

```
http://127.0.0.1:8339
```

No separate server needed — the explorer is built into the binary.

Live explorer: **https://chakram.one**

## Network

| | Mainnet | Testnet |
|---|---|---|
| P2P port | 8338 | 18338 |
| RPC port | 8339 | 18339 |
| Block time | ~30 sec | ~30 sec |
| Halving | every 2,102,400 blocks (~2 years) | every 2,102,400 blocks |
| Initial reward | 50 CHK | 50 CHK |
| Max supply | 44,800,000 CHK | 44,800,000 CHK |

### DNS seeds

On startup, nodes resolve `seeds.chakram.one` to discover the network. If DNS is unavailable, three hardcoded fallback IPs are used automatically. Discovered peers are saved to `~/.chakram/mainnet/peers.json` so the node can reconnect without DNS on the next start.

Anyone can run a community seed — see [CONTRIBUTING.md](CONTRIBUTING.md).

## Checkpoints

Checkpoints are block hashes hardcoded into the binary. A block at a checkpointed height must exactly match — a peer serving a different hash is rejected. Reorgs cannot roll back past the highest checkpoint.

| Height | Hash |
|---|---|
| 600 | `081454bdec667c88b5b5b10ca539688efeb2c8b872cbe250e30be7b0813c752d` |

Verify any checkpoint yourself by querying `/block/600` on any fully synced node.

## Data directory

All node data is stored under `~/.chakram/mainnet/` (or `~/.chakram/testnet/`):

| File | Contents |
|---|---|
| `wallet.json` | Encrypted Ed25519 key + mnemonic (Argon2id) |
| `peers.json` | Known peer addresses — persists across restarts |
| `badger/` | BadgerDB chain and UTXO database |

## Build from Source

Requires Go 1.21+ and a C compiler (for RandomX CGo bindings).

```bash
git clone https://github.com/anandhu-here/chakram
cd chakram

# Native build (CGo enabled — full RandomX performance)
go build -o chakram .

# Cross-compile (pure-Go RandomX fallback, sufficient for relay nodes)
GOOS=linux   GOARCH=amd64 CGO_ENABLED=0 go build -o chakram-linux .
GOOS=windows GOARCH=amd64                go build -o chakram-windows.exe .
GOOS=darwin  GOARCH=amd64                go build -o chakram-mac .
```

Pre-built RandomX static libraries are vendored in `lib/` for macOS Intel, macOS Apple Silicon, Linux AMD64, and Windows AMD64. No separate library install needed.

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full build guide including the web frontend.

## RPC API

JSON HTTP API on the RPC port. Base URL: `http://127.0.0.1:8339` (localhost only by default).

| Endpoint | Description |
|---|---|
| `GET /info` | Node status, height, peers, sync state, total supply |
| `GET /block/:height` | Block by height |
| `GET /block/hash/:hash` | Block by 64-char hex hash |
| `GET /blocks/latest/:n` | Last N blocks, newest first (max 50) |
| `GET /tx/:txid` | Transaction by ID |
| `GET /address/:address` | Address balance and UTXO count |
| `GET /utxos/:address` | Unspent outputs — use as inputs when building transactions |
| `GET /peers` | Connected peers |
| `POST /tx/submit` | Broadcast a signed transaction |

Full protocol documentation: **https://chakram.one/docs**

## Protocol Upgrades

Chakram uses a versioned fork activation system. Hard forks activate at a specific block height — miners have advance notice to upgrade. Nodes that miss an upgrade are rejected by `MinProtocolVersion` in subsequent releases.

See `config.go` (`ForkActivations`, `ProtocolVersion`, `MinProtocolVersion`).

## About the Name

The **Chakram** (ചക്രം) was a small copper coin used in the Travancore kingdom of Kerala from the 18th–19th centuries. The word **"cash"** itself derives from the Malayalam **"Kasu"** (കാശ്) — a denomination used throughout Kerala's trading history. Chakram (CHK) honours that heritage by bringing it into the digital age.

## License

MIT
