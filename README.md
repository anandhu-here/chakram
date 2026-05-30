# ⬡ Chakram (CHK)

**Website:** https://chakram.one

> ചക്രം — The heritage of Kerala, reborn in the digital age.

> ⚠️ **Note:** Code signing certificates are on our roadmap. For now, Mac and Windows users may see security warnings — this is normal for open-source software without paid certificates. See installation instructions below.

Chakram is a fast, CPU-mineable cryptocurrency inspired by the ancient Travancore kingdom coins of Kerala, India. Anyone can mine it — on a laptop, desktop, or spare Android phone.

## Features

- ⛏ **CPU Mining** — RandomX algorithm, ASIC resistant. Mine with any laptop or desktop.
- ⚡ **Fast** — 60 second block time, near-instant confirmations.
- 🔒 **Secure** — Ed25519 signatures, double SHA256, BadgerDB storage.
- 🌍 **Decentralised** — P2P network, no central authority.
- 📱 **Mobile Ready** — Android mining node coming in v1.1.
- 🏛 **Cultural Heritage** — Named after the real Travancore Chakram coin.  
  1 CHK = 1,000,000 Cash. The word "cash" comes from the Malayalam "Kasu".

## Installation

Download the latest binary for your platform from [Releases](https://github.com/anandhusathe/chakram/releases).

### macOS

1. Download `chakram-mac`
2. Open Terminal (search "Terminal" in Spotlight)
3. Run these commands:

```bash
cd ~/Downloads
chmod +x chakram-mac
xattr -d com.apple.quarantine chakram-mac
./chakram-mac node --testnet
```

> If you see "cannot be opened" — right-click the file, select **Open**, then click **Open** in the dialog.

### Windows

1. Download `chakram-windows.exe`
2. Double-click to run
3. If Windows SmartScreen appears:
   - Click **More info**
   - Click **Run anyway**
4. A terminal window will open with your node running

### Linux

1. Download `chakram-linux`
2. Open terminal:

```bash
chmod +x chakram-linux
./chakram-linux node --testnet
```

## Quick Start

### Run a Node

```bash
# macOS/Linux — after installation steps above
./chakram-mac node --testnet

# Windows — double-click or run in terminal
chakram-windows.exe node --testnet
```

Your node will:
1. Generate a wallet automatically
2. Connect to the Chakram testnet
3. Start syncing the blockchain
4. Display your CK1 address

**⚠️ Back up your 12-word mnemonic phrase immediately.**

### Mine Chakram

```bash
./chakram-mac node --testnet --mine
```

Mining rewards go directly to your wallet address.

### Wallet Commands

```bash
# Show your wallet address
./chakram-mac wallet address --testnet

# Check your balance
./chakram-mac wallet balance --testnet

# Generate a new wallet
./chakram-mac wallet new
```

### Block Explorer

Once your node is running, open your browser:

```
http://localhost:18339
```

The block explorer is built into the node binary. No separate server needed.

You can also browse the live testnet explorer at:

```
http://35.207.217.64:18339
```

## Network

| | Testnet | Mainnet |
|---|---|---|
| P2P Port | 18338 | 8338 |
| RPC Port | 18339 | 8339 |
| Seeds | 35.207.229.32, 34.1.166.49 | — |
| Block time | ~60 sec | ~60 sec |
| Halving | every 1,051,200 blocks | every 1,051,200 blocks |
| Initial reward | 50 CHK | 50 CHK |
| Max supply | ~105,000,000 CHK | ~105,000,000 CHK |

## Build from Source

Requires Go 1.21+.

```bash
git clone https://github.com/anandhusathe/chakram
cd chakram

# Build for your platform
go build -o chakram .

# Cross-compile
GOOS=linux   GOARCH=amd64 go build -o chakram-linux .
GOOS=windows GOARCH=amd64 go build -o chakram-windows.exe .
GOOS=darwin  GOARCH=amd64 go build -o chakram-mac .
```

## Configuration

Copy the example config and edit as needed:

```bash
cp chakram.conf.example ~/.chakram/chakram.conf
```

See [`chakram.conf.example`](chakram.conf.example) for all options.

## RPC API

The node exposes a JSON HTTP API on the RPC port:

| Endpoint | Description |
|---|---|
| `GET /` | Block explorer UI |
| `GET /info` | Node info, height, peers, supply |
| `GET /block/:height` | Block by height |
| `GET /block/hash/:hash` | Block by hash |
| `GET /blocks/latest/:n` | Last N blocks (max 50) |
| `GET /tx/:txid` | Transaction by ID |
| `GET /address/:address` | Address balance and UTXOs |
| `GET /peers` | Connected peers |

## About the Name

The **Chakram** (ചക്രം) was a small copper coin used in the Travancore kingdom of Kerala from the 18th–19th centuries. The word **"cash"** itself derives from the Malayalam word **"Kasu"** (കാശ്) — a coin denomination used throughout Kerala's trading history. Chakram (CHK) honours this heritage by bringing Kerala's monetary legacy into the digital age.

## License

MIT
