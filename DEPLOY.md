# Chakram v0.1.5 — Release & Deploy Guide

## What the scripts do

**`release.sh <version> <notes>`**
1. `git add . && git commit && git push` — commits everything
2. `git tag <version> && git push origin <version>` — tags it on GitHub
3. Runs `deploy.sh` (see below)
4. Builds Mac, Linux, and Windows binaries locally
5. Creates a GitHub release with all three binaries attached

**`deploy.sh`** (called automatically by `release.sh`)
1. Builds a fresh Linux binary
2. Stops all three GCP services (seed-1, seed-2, miner)
3. Copies the binary to all three VMs
4. Wipes testnet chain data on all three VMs
   - Seed nodes: full directory wipe
   - Miner: wipes everything **except** `wallet.json` so it keeps mining to the same address
5. Starts all three services from genesis

---

## Step 1 — Run the release

```bash
./release.sh v0.1.5 "chain reorg, full tx storage, difficulty adjustment, peer banning, wallet recover"
```

Watch the output — it will print each step as it goes. The whole thing takes about 2–3 minutes.

---

## Step 2 — Confirm the miner is producing blocks

SSH into the miner and tail the logs:

```bash
ssh anandhusathe@35.207.217.64 "sudo journalctl -u chakram-miner -f --no-pager"
```

Expected output within a few seconds of start:

```
Wallet loaded:  CK1...          ← existing wallet preserved
⛏  Mined block 1 — hash: ...
⛏  Mined block 2 — hash: ...
```

If `wallet.json` was not present on the VM (unlikely), you will see a new wallet being created instead:

```
New wallet created: CK1...
Mnemonic: word1 word2 word3 ...
```

If you see the mnemonic, copy it immediately before the log scrolls.

---

## Step 3 — Confirm the block explorer shows the new chain

Open the block explorer:

```
http://35.207.217.64:18339/
```

- **Latest Block** height should be 1, 2, 3 … and climbing
- **Timestamp** should be seconds ago, not hours ago
- Block detail should show the coinbase transaction with the miner address and reward amount (full tx data is now stored)

---

## Step 4 — Wipe your local testnet data

Your Mac has the old forked chain at `~/.chakram/testnet/`. Delete it before running the new binary locally:

```bash
rm -rf ~/.chakram/testnet/
```

Then start your local node:

```bash
./chakram-mac node --testnet
```

It will create a fresh wallet, connect to the seed nodes, and sync from block 1.

---

## Step 5 — Verify miner wallet is intact

Run this to confirm the miner is using the expected address and that the mnemonic is recoverable from the logs if needed:

```bash
ssh anandhusathe@35.207.217.64 \
  "sudo journalctl -u chakram-miner --no-pager | grep -E 'Mnemonic|New wallet|Wallet loaded'"
```

---

## GCP VM reference

| Role    | IP              | Service          |
|---------|-----------------|------------------|
| Seed 1  | 35.207.229.32   | chakram-seed     |
| Seed 2  | 34.1.166.49     | chakram-seed     |
| Miner   | 35.207.217.64   | chakram-miner    |

Block explorer / RPC: `http://35.207.217.64:18339/`

---

## Manual service commands (if needed)

```bash
# Check status
ssh anandhusathe@35.207.217.64 "sudo systemctl status chakram-miner"

# Restart manually
ssh anandhusathe@35.207.217.64 "sudo systemctl restart chakram-miner"

# View live logs
ssh anandhusathe@35.207.217.64 "sudo journalctl -u chakram-miner -f --no-pager"

# Check RPC is responding
curl -s http://35.207.217.64:18339/info | python3 -m json.tool
```

---

## Wipe chain data only (without re-deploying)

If you ever need to reset the chain without redeploying the binary:

```bash
# Seed nodes — full wipe
ssh anandhusathe@35.207.229.32 "sudo systemctl stop chakram-seed && rm -rf ~/.chakram/testnet/ && sudo systemctl start chakram-seed"
ssh anandhusathe@34.1.166.49  "sudo systemctl stop chakram-seed && rm -rf ~/.chakram/testnet/ && sudo systemctl start chakram-seed"

# Miner — keep wallet.json
ssh anandhusathe@35.207.217.64 \
  "sudo systemctl stop chakram-miner && \
   find ~/.chakram/testnet/ -mindepth 1 -not -name 'wallet.json' -delete && \
   sudo systemctl start chakram-miner"
```
