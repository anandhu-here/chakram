// difficulty.go — Sliding-window difficulty retarget for Chakram.
// The algorithm samples the DifficultyWindow most recent blocks and adjusts
// so that block production converges on TargetBlockTime seconds per block.
package main

// NextDifficulty returns the proof-of-work difficulty that the block at height
// should use. It is called by the miner before creating a new block, and must
// be called with the same deterministic parameters on every node so the network
// reaches consensus on the expected difficulty.
//
// Algorithm:
//  - For the first DifficultyWindow blocks, return InitialDifficulty so the
//    chain starts at a sensible block rate without a calibration period.
//  - Otherwise, measure elapsed wall time over the last DifficultyWindow blocks
//    and scale the current difficulty by (targetTime / actualTime).
//  - The change is capped at ±4× per window to prevent runaway swings.
//  - The result is never allowed to fall below MinDifficulty.
func NextDifficulty(bc *Blockchain, height uint64) uint64 {
	if height <= DifficultyWindow {
		return InitialDifficulty
	}

	newest, err := bc.Storage.GetBlockByHeight(height - 1)
	if err != nil {
		return InitialDifficulty
	}
	oldest, err := bc.Storage.GetBlockByHeight(height - 1 - DifficultyWindow)
	if err != nil {
		return InitialDifficulty
	}

	actualTime := newest.Header.Timestamp - oldest.Header.Timestamp
	if actualTime <= 0 {
		actualTime = 1
	}
	targetTime := int64(DifficultyWindow) * TargetBlockTime

	current := newest.Header.Difficulty
	if current < MinDifficulty {
		current = MinDifficulty
	}

	// Scale proportionally: higher difficulty when blocks come too fast.
	next := current * uint64(targetTime) / uint64(actualTime)

	// Cap the per-window change at 4× in either direction.
	if next > current*4 {
		next = current * 4
	}
	if current > 4 && next < current/4 {
		next = current / 4
	}
	if next < MinDifficulty {
		next = MinDifficulty
	}
	return next
}
