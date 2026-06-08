# ⬡ Chakram (CHK)

**Website:** https://chakram.one

> ചക്രം — The heritage of Kerala, reborn in the digital age.

> ⚠️ **Note:** Code signing certificates are on our roadmap. For now, Mac and Windows users may see security warnings — this is normal for open-source software without paid certificates. See installation instructions below.

Chakram is a fast, CPU-mineable cryptocurrency inspired by the ancient Travancore kingdom coins of Kerala, India. Anyone can mine it — on a laptop, desktop, or spare Android phone.

## Features

- **CPU Mining** — RandomX algorithm, ASIC resistant. Mine with any laptop or desktop.
- **Fast** — 30 second block time, near-instant confirmations.
- **Secure** — Ed25519 signatures, double SHA256, BadgerDB storage.
- **Decentralised** — P2P network, no central authority.
- **Cultural Heritage** — Named after the real Travancore Chakram coin.
  1 CHK = 1,000,000 Cash. The word "cash" comes from the Malayalam "Kasu".

## Installation

Download the latest binary for your platform from [Releases](https://github.com/anandhu-here/chakram/releases), or get the GUI desktop app from [chakram.one/download](https://chakram.one/download).

### macOS

```bash
cd ~/Downloads
chmod +x chakram-mac
xattr -d com.apple.quarantine chakram-mac
./chakram-mac node
```

> If you see "cannot be opened" — right-click the file, select **Open**, then click **Open** in the dialog.

### Windows

1. Download `chakram-windows.exe`
2. Double-click to run
3. If Windows SmartScreen appears: click **More info** → **Run anyway**

### Linux

```bash
chmod +x chakram-linux
./chakram-linux node
```

## Quick Start

### Run a Node

```bash
./chakram-mac node       # macOS
./chakram-linux node     # Linux
chakram-windows.exe node # Windows (or double-click)
```

Your node will:
1. Generate a wallet automatically
2. Connect to the Chakram network
3. Start syncing the blockchain
4. Display your CK1 address

**Back up your 12-word mnemonic phrase immediately.**

### Mine Chakram

```bash
./chakram-mac node --mine
```

Mining rewards go directly to your wallet address.

### Wallet Commands

```bash
# Show your wallet address
./chakram-mac wallet address

# Check your balance
./chakram-mac wallet balance

# Send CHK
./chakram-mac send CK1... 10.5

# Generate a new wallet
./chakram-mac wallet new

# Recover from mnemonic
./chakram-mac wallet recover --mnemonic "word1 word2 ... word12"
```

### Block Explorer

Once your node is running, open your browser at:

```
http://localhost:8339
```

The block explorer is built into the node — no separate server needed.

> By default the RPC binds to localhost only. Start with `--rpc-public` to expose it on the network.

Live explorer: **https://chakram.one**

## Network

| | Mainnet | Testnet |
|---|---|---|
| P2P Port | 8338 | 18338 |
| RPC Port | 8339 | 18339 |
| Block time | ~30 sec | ~30 sec |
| Halving | every 2,102,400 blocks | every 2,102,400 blocks |
| Initial reward | 50 CHK | 50 CHK |
| Max supply | 44,800,000 CHK | 44,800,000 CHK |

## Build from Source

Requires Go 1.21+.

```bash
git clone https://github.com/anandhu-here/chakram
cd chakram

# Build for your platform (CGo enabled — requires a C compiler for RandomX)
go build -o chakram .

# Cross-compile (pure-Go RandomX fallback, sufficient for relay nodes)
GOOS=linux   GOARCH=amd64 CGO_ENABLED=0 go build -o chakram-linux .
GOOS=windows GOARCH=amd64 go build -o chakram-windows.exe .
GOOS=darwin  GOARCH=amd64 go build -o chakram-mac .
```

### RandomX Libraries

Pre-built static libraries are vendored in `lib/` for supported platforms:

| Platform | Path |
|---|---|
| macOS Intel | `lib/darwin_amd64/librandomx.a` |
| macOS Apple Silicon | `lib/darwin_arm64/librandomx.a` |
| Linux AMD64 | `lib/linux_amd64/librandomx.a` |
| Windows AMD64 | `lib/windows_amd64/librandomx.a` |

To rebuild a library from source, see the [RandomX repository](https://github.com/tevador/RandomX).

## Configuration

```bash
cp chakram.conf.example ~/.chakram/chakram.conf
```

See [`chakram.conf.example`](chakram.conf.example) for all options.

## RPC API

The node exposes a JSON HTTP API on the RPC port:

| Endpoint | Description |
|---|---|
| `GET /info` | Node info, height, peers, supply |
| `GET /block/:height` | Block by height |
| `GET /block/hash/:hash` | Block by hash |
| `GET /blocks/latest/:n` | Last N blocks (max 50) |
| `GET /tx/:txid` | Transaction by ID |
| `GET /address/:address` | Address balance (balance, balance_chk, utxo_count) |
| `GET /utxos/:address` | Unspent outputs for an address (use as tx inputs) |
| `GET /peers` | Connected peers |
| `POST /tx/submit` | Broadcast a signed transaction |

## Protocol Upgrades

Chakram uses a versioned fork activation system. Scheduled hard forks activate at a specific block height — miners have advance notice to upgrade before the rules change. Old nodes that miss the upgrade are rejected by `MinProtocolVersion` in subsequent releases.

See `config.go` (`ForkActivations`, `ProtocolVersion`, `MinProtocolVersion`) for details.

## About the Name

The **Chakram** (ചക്രം) was a small copper coin used in the Travancore kingdom of Kerala from the 18th–19th centuries. The word **"cash"** itself derives from the Malayalam word **"Kasu"** (കാശ്) — a coin denomination used throughout Kerala's trading history. Chakram (CHK) honours this heritage by bringing Kerala's monetary legacy into the digital age.

## License

MIT
