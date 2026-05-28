# Chakram Blockchain Hardening — Issues & Solutions

This document explains the problems found in the early Chakram testnet and how
each one was resolved. All explanations are intentionally non-technical so the
reasoning behind each decision is clear without reading source code.

---

## 1. Permanent Chain Fork (Critical)

### What happened
Two miners found valid blocks at the same height at nearly the same time.  Both
blocks were mathematically correct — they just happened to be different valid
answers to the same puzzle.  In a healthy blockchain every node must agree on
exactly one version of history.  Because Chakram had no way to resolve this
disagreement, the two nodes permanently diverged: one kept building on block A
and the other on block B.  Every block mined after that point made the split
worse.

### Why it matters
A permanent fork means the network has effectively become two separate
currencies.  Any coins mined on one chain are worthless on the other.  This is
the single most serious failure mode for a blockchain.

### How Bitcoin handles it
Bitcoin uses a simple rule: the *longest valid chain always wins*.  When a node
sees a chain that is longer than its own it performs a *chain reorganisation*
(reorg): it rolls back its own recent blocks, switches to the competing chain's
blocks, and continues from there.  Only the longest chain is ever considered the
"real" chain.

### How we fixed it
We implemented full chain reorganisation in Chakram:

- **Block undo data** — every time a block is added to the main chain, Chakram
  now records exactly which coins were created and which were spent.  This
  record is stored permanently alongside the block.

- **Side-chain storage** — blocks that do not extend the current tip are stored
  by their hash instead of being rejected.  This means a competing chain can be
  assembled quietly in the background.

- **Reorg trigger** — when a competing chain grows longer than the current main
  chain, Chakram automatically: walks back to the common ancestor, reverses all
  UTXO changes from the old chain using the saved undo data, then applies all
  blocks from the new chain in order.

- **Height-index separation** — the mapping from block height to block hash now
  only reflects the main chain.  When a reorg happens the index is updated for
  all affected heights.

The result: whichever chain accumulates the most proof-of-work always becomes
the official chain, and all nodes converge on the same history.

---

## 2. Miner OOM / Stuck Mining (Critical)

### What happened
The GCP mining VM froze for over an hour and stopped producing blocks.  A
goroutine dump showed the miner was deep inside the RandomX cache initialisation
routine (`InitDatasetItem`), which normally takes a few seconds but was taking
79+ minutes because the machine had run out of RAM and was using swap memory.

### Root cause
RandomX requires a 256 MB in-memory cache (called the Argon2d cache) that is
seeded by a key value.  Every time the miner started working on a new block it
was calling the cache initialisation function with the *previous block's hash*
as the key.  Because every block has a different hash, the cache was being
rebuilt from scratch for every single block.

Simultaneously, the old cache was not being freed before the new one was
allocated, so memory usage grew block by block until the machine hit its RAM
limit and started swapping.  Swap-speed Argon2d is catastrophically slow.

### How we fixed it
**Epoch-based cache keys** — instead of using the previous block's hash (which
changes every block), Chakram now only changes the RandomX seed at *epoch
boundaries*: every 64 blocks.  Between epoch boundaries every node uses the
same seed, so the 256 MB cache is computed once and then reused for 63 more
blocks.

**Key caching** — the RandomX engine now remembers the last key it was
initialised with.  If the same key is requested again it skips the expensive
Argon2d step entirely.

Combined, these changes reduce Argon2d calls from one per block to one per 64
blocks, eliminating both the OOM pressure and the mining stall.

---

## 3. Full Transaction Data Loss (Serious)

### What happened
When Chakram stored a block to disk, it only saved the list of transaction IDs
(fingerprints).  The actual transaction data — who sent how much to whom — was
discarded.  When a block was loaded back from disk its transactions appeared
empty.

### Why it matters
- The block explorer could not show inputs, outputs, or miner addresses for any
  block loaded from storage.
- The `/tx/<id>` API endpoint could never return useful data for confirmed
  transactions.
- Chain reorganisation requires re-applying transactions from both chains, which
  is impossible if the transaction data is gone.

### How we fixed it
The on-disk block format now stores the complete transaction data for every
transaction in every block: the transaction ID, all inputs (which coins are
being spent and the cryptographic proof of ownership), all outputs (who receives
how much), the timestamp, and whether it is a coinbase (miner reward)
transaction.  Storage size per block increases, but every block is now fully
self-contained and can be verified or re-applied at any time.

---

## 4. Dynamic Difficulty Adjustment

### What happened
The mining difficulty was hardcoded to `1` — the minimum possible value.  At
difficulty 1 roughly one in every two RandomX hash attempts produces a valid
block, meaning blocks arrive almost instantly rather than on a schedule.  As the
RandomX engine became faster (after the OOM fix), block times would vary
wildly.

### Why it matters
Predictable block times are important for user experience (how long does a
transaction take to confirm?) and for network security (a chain that produces
blocks faster accumulates "work" faster, which could be exploited).

### How we fixed it
A **sliding-window difficulty algorithm** computes the correct difficulty for
each new block:

1. Look at the last 60 blocks.
2. Measure how long they actually took vs. how long they *should* have taken at
   the 10-second target.
3. Scale the difficulty proportionally: if blocks came twice as fast as the
   target, double the difficulty; if they came twice as slow, halve it.
4. Cap the per-window change at 4× in either direction to prevent sudden
   violent swings.
5. Never go below the minimum difficulty (1).

For the first 60 blocks (before there is enough history) a sensible bootstrap
difficulty of 11 is used, which corresponds to roughly one valid hash in every
2048 attempts — about a 10-second block time at typical GCP VM speeds.

---

## 5. Fake Proof-of-Work Acceptance

### What happened
When a peer sent a block, Chakram only checked that the block's stored hash was
numerically below the difficulty target.  It did not check whether that hash was
the *actual* RandomX hash of the block's header data.  A malicious peer could
send a block with a fabricated (low-value) hash that satisfies the difficulty
target without performing any real computational work.

### How we fixed it
Added a `VerifyBlock` function to `pow.go` that re-computes the RandomX hash
of a block's header and checks that it equals the stored hash *and* satisfies
the difficulty target.  The epoch-based key derivation (fix #2) is reused so
the verification engine benefits from the same caching optimisation as the miner.

**Current status:** `VerifyBlock` is implemented and correct.  It is not yet
called automatically on every received block because re-running the full RandomX
computation for each block during an initial chain download would make syncing
thousands of blocks prohibitively slow.  Calling it at sync time is deferred to
a future release once selective verification (new tip only, not IBD) is
implemented.  Structural validation (height, timestamp, parent linkage, and
difficulty-target check on the stored hash) is enforced on every block today.

---

## 6. Peer Banning

### What happened
There was no mechanism to disconnect or block peers that behaved badly — sending
garbage data, invalid blocks, or flooding the node with protocol violations.  A
misbehaving or malicious peer could stay connected indefinitely.

### How we fixed it
Added a violation tracking system:

- Each peer has an internal violation counter.
- Protocol errors (undecodable messages, invalid payloads) increment the
  counter.
- When a peer reaches 5 violations it is **banned**: disconnected immediately
  and its IP address blocked for 24 hours.
- Incoming connections from banned addresses are rejected at the TCP level
  before any data is exchanged.

---

## 7. Wallet Recovery from Mnemonic

### What happened
Chakram generated a 12-word recovery phrase when creating a new wallet and
warned users to back it up.  However, there was no command to actually *use*
that phrase to restore a wallet.  If a user's wallet file was deleted or the
password forgotten, there was no recovery path.

### How we fixed it
Added the `chakram wallet recover` command:

```
chakram wallet recover --mnemonic "word1 word2 ... word12" [--password <pass>] [--testnet]
```

This re-derives the same private key from the mnemonic phrase (using the same
BIP39 algorithm that created it), reconstructs the wallet address, and saves a
new encrypted wallet file.  The recovered wallet is identical to the original —
same address, same private key, full access to all funds.

---

## Summary Table

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | Permanent chain fork — no reorganisation | Critical | Fixed |
| 2 | Miner OOM / stuck 79 minutes | Critical | Fixed |
| 3 | Transaction data lost on disk | Serious | Fixed |
| 4 | Hardcoded difficulty — no adjustment | Moderate | Fixed |
| 5 | Fake PoW accepted from peers | Moderate | Partial (VerifyBlock implemented; IBD integration deferred) |
| 6 | No peer banning | Moderate | Fixed |
| 7 | No wallet recovery command | Minor | Fixed |

All fixes were shipped together as v0.1.5.  After deploying, the testnet chain
data should be wiped and restarted from genesis so all nodes begin from a clean
state with the new rules in effect.
