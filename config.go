// config.go — Core constants for the Chakram (CHK) cryptocurrency.
// Inspired by the ancient Travancore kingdom coins of Kerala, India.
package main

// ── Coin Identity ────────────────────────────────────────────────────────────

const (
	CoinName      = "Chakram"
	Ticker        = "CHK"
	Version       = 1
	AddressPrefix = "CK1"
)

// ── Supply & Economics ───────────────────────────────────────────────────────

const (
	// CashPerCHK is the number of indivisible Cash units in one CHK (like Satoshis in Bitcoin).
	CashPerCHK uint64 = 1_000_000

	// MaxSupply is the hard cap in Cash units (44,800,000 CHK).
	MaxSupply uint64 = 44_800_000 * CashPerCHK

	// InitialBlockReward is the reward for mining the first era of blocks, in Cash.
	InitialBlockReward uint64 = 50 * CashPerCHK

	// HalvingInterval is the number of blocks between each block-reward halving
	// (~2 years at a 60-second block time).
	HalvingInterval uint64 = 1_051_200

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
	TargetBlockTime int64 = 60

	// DifficultyWindow is the number of recent blocks used to compute the next
	// difficulty target (sliding-window retarget).
	DifficultyWindow uint64 = 60

	// InitialDifficulty is the difficulty used for the first DifficultyWindow
	// blocks before LWMA has enough history. Set to target ~60 s per block on
	// the launch hardware (~135 H/s RandomX light-mode): 2^13 / 135 ≈ 60 s.
	// If the miner is significantly faster, increase this value before launch.
	InitialDifficulty uint64 = 13

	// DifficultyAdjustmentInterval is kept for reference / future batch retarget.
	DifficultyAdjustmentInterval uint64 = 2016

	// MaxBlockSize is the maximum serialised block size in bytes (1 MB).
	MaxBlockSize uint64 = 1 * 1024 * 1024

	// CoinbaseMaturity is the number of confirmations required before a mined
	// reward can be spent.
	CoinbaseMaturity uint64 = 100

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
	MinDifficulty uint64 = 1

	// RandomXLightMode uses the cache-only (light) RandomX mode (~256 MB RAM).
	// Full mode requires ~2 GB and is impractical on mobile. Light mode is used
	// for all platforms; server nodes may switch to full mode in a later phase.
	RandomXLightMode = true

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

