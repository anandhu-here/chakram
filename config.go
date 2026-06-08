// config.go — Core constants for the Chakram (CHK) cryptocurrency.
// Inspired by the ancient Travancore kingdom coins of Kerala, India.
package main

// ── Coin Identity ────────────────────────────────────────────────────────────

const (
	CoinName      = "Chakram"
	Ticker        = "CHK"
	AddressPrefix = "CK1"

	// ProtocolVersion is the current network protocol version, embedded in
	// every block header and P2P handshake. Increment this for each hard fork.
	// Old nodes will be rejected once MinProtocolVersion is raised to match.
	ProtocolVersion uint32 = 1

	// MinProtocolVersion is the lowest peer protocol version this node accepts
	// during the handshake. Raise this (with a new release) after a hard fork
	// to isolate nodes that have not upgraded.
	MinProtocolVersion uint32 = 1

	// SoftwareVersion is the human-readable release string. Bumped by release.sh.
	SoftwareVersion = "v1.0.59"
)

// ForkActivations maps each protocol version to the block height at which its
// consensus rules activate. Version 1 always starts at genesis (height 0).
//
// To schedule a hard fork:
//  1. Implement the new rules guarded by ProtocolVersionAt(height) >= newVer.
//  2. Add newVer → activationHeight here and set ProtocolVersion = newVer.
//  3. Release the binary with at least activationHeight–currentHeight blocks
//     of lead time so miners can upgrade before rules change.
//  4. After the fork activates, raise MinProtocolVersion = newVer in the
//     following release to disconnect nodes still running old code.
var ForkActivations = map[uint32]uint64{
	1: 0, // genesis rules, always active
}

// Checkpoints are immutable (height → hex-encoded hash) entries committed to
// by this binary. Any block at a checkpointed height must exactly match.
// Reorganizations may never roll back past the highest checkpoint.
// Add a new entry with each major release after the chain has stabilised.
var Checkpoints = map[uint64]string{}

// ── Supply & Economics ───────────────────────────────────────────────────────

const (
	// CashPerCHK is the number of indivisible Cash units in one CHK (like Satoshis in Bitcoin).
	CashPerCHK uint64 = 1_000_000

	// MaxSupply is the hard cap in Cash units (44,800,000 CHK).
	MaxSupply uint64 = 44_800_000 * CashPerCHK

	// InitialBlockReward is the reward for mining the first era of blocks, in Cash.
	InitialBlockReward uint64 = 50 * CashPerCHK

	// HalvingInterval is the number of blocks between each block-reward halving
	// (~2 years at a 30-second block time).
	HalvingInterval uint64 = 2_102_400

	// MinTxFee is the minimum transaction fee in Cash units.
	MinTxFee uint64 = 1_000
)

// ── Network ──────────────────────────────────────────────────────────────────

const (
	DefaultPortMainnet = 8338
	DefaultPortTestnet = 18338
	RPCPortMainnet     = 8339
	RPCPortTestnet     = 18339

	MaxPeers = 12
	MinPeers = 3
)

// MagicMainnet and MagicTestnet are the 4-byte network identifiers prepended to
// all peer-to-peer messages to prevent cross-network communication.
// Mainnet bytes spell "CHAK" (CHAKram); testnet flips the last byte.
var (
	MagicMainnet = [4]byte{0x43, 0x48, 0x41, 0x4B} // C H A K
	MagicTestnet = [4]byte{0x43, 0x48, 0x41, 0x54} // C H A T
)

// ── Blockchain ───────────────────────────────────────────────────────────────

const (
	// TargetBlockTime is the desired seconds between blocks.
	TargetBlockTime int64 = 30

	// DifficultyWindow is the number of recent blocks used to compute the next
	// difficulty target (sliding-window retarget).
	DifficultyWindow uint64 = 60

	// InitialDifficulty is the PoW baseline during the bootstrap window.
	// With timestamp-enforced bootstrap (TEB), block rate is controlled by the
	// 60-second time floor, not by this value. This only needs to be high enough
	// to prevent trivial block forgery. 2^4 = 16 expected hashes — achievable in
	// seconds on any hardware, so the time floor always controls the actual rate.
	InitialDifficulty uint64 = 4

	// DifficultyAdjustmentInterval is kept for reference / future batch retarget.
	DifficultyAdjustmentInterval uint64 = 2016

	// MaxBlockSize is the maximum serialised block size in bytes (1 MB).
	MaxBlockSize uint64 = 1 * 1024 * 1024

	// CoinbaseMaturity is the number of confirmations required before a mined
	// reward can be spent. 10 blocks × 60 s = ~10 min wait before spending rewards.
	CoinbaseMaturity uint64 = 10

	// RandomXEpochLen is how many blocks share the same RandomX cache seed.
	// Argon2d is only re-run when the epoch boundary changes.
	RandomXEpochLen uint64 = 64
)

// ── Genesis ───────────────────────────────────────────────────────────────────

const (
	// GenesisMessage is the coinbase message embedded in the genesis block.
	// Translation: "Chakram — The heritage of Kerala, reborn in the digital age."
	GenesisMessage = "ചക്രം — കേരളത്തിന്റെ പൈതൃകം ഡിജിറ്റൽ യുഗത്തിൽ പുനർജനിക്കുന്നു"

	// GenesisTimestamp is the fixed Unix timestamp of the genesis block (2026-05-28 00:00:00 UTC).
	GenesisTimestamp int64 = 1_779_926_400
)

// ── Mining ────────────────────────────────────────────────────────────────────

const (
	// MiningAlgorithm identifies the proof-of-work algorithm used by Chakram.
	MiningAlgorithm = "RandomX"

	// MinDifficulty is the lowest allowed network difficulty target.
	MinDifficulty uint64 = 4

	// PostBootstrapMinGap is the minimum seconds between consecutive blocks
	// after the TEB bootstrap window ends. Prevents a single fast miner from
	// flooding the network with sub-second blocks that cause LWMA to overshoot.
	// 45s floor means blocks can run at most 1.33× faster than target during
	// calibration, keeping the LWMA overshoot small at bootstrap boundary.
	PostBootstrapMinGap int64 = 45

	// RandomXLightMode is retained for reference. The CGo engine uses full mode
	// (2 GB dataset, ~10x faster) on all supported platforms and falls back to
	// light mode automatically if the system cannot allocate the dataset.
	RandomXLightMode = false

	// MiningThreads is the default number of threads used during mining.
	// Can be overridden via the node config file in a later phase.
	MiningThreads = 1
)

// ── Seed Nodes ────────────────────────────────────────────────────────────────

var TestnetSeeds = []string{
	"35.207.229.32:18338",
	"34.1.166.49:18338",
}

var MainnetSeeds = []string{
	"35.207.229.32:8338",
	"34.1.166.49:8338",
	"35.207.217.64:8338",
}

