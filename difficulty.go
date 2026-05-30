// difficulty.go — LWMA-3 difficulty retarget for Chakram.
// Uses Linearly Weighted Moving Average (LWMA-3) giving more weight to recent
// blocks. Adopted by low-hashrate networks (Zcash, Beam) to resist timestamp
// manipulation and hash-rate volatility.
package main

// NextDifficulty returns the proof-of-work difficulty for the block at height.
// Called by the miner and must produce identical results on every node.
//
// Algorithm (LWMA-3):
//   - For the first DifficultyWindow blocks return InitialDifficulty so the
//     chain starts at a sensible rate without a calibration period.
//   - Fetch the last DifficultyWindow+1 blocks to derive N solve times.
//   - Assign linearly increasing weights (oldest=1, newest=N) so recent blocks
//     influence the estimate more than old ones.
//   - Clamp each solve time to [1, 6×TargetBlockTime] to limit the damage a
//     manipulated timestamp can do to a single sample.
//   - Adjust current difficulty by TargetBlockTime / weighted_avg.
//   - Cap the per-window change at 4× in either direction.
//   - Result never falls below InitialDifficulty.
func NextDifficulty(bc *Blockchain, height uint64) uint64 {
	if height <= DifficultyWindow {
		return InitialDifficulty
	}

	N := int(DifficultyWindow)

	// Fetch N+1 consecutive blocks (oldest → newest).
	blocks := make([]*Block, N+1)
	for i := 0; i <= N; i++ {
		h := height - 1 - uint64(N-i)
		b, err := bc.Storage.GetBlockByHeight(h)
		if err != nil {
			return InitialDifficulty
		}
		blocks[i] = b
	}

	current := blocks[N].Header.Difficulty
	if current < InitialDifficulty {
		current = InitialDifficulty
	}

	// Linearly weighted sum of clamped solve times.
	var weightedSum, divisor int64
	for i := 1; i <= N; i++ {
		solveTime := blocks[i].Header.Timestamp - blocks[i-1].Header.Timestamp
		if solveTime < 1 {
			solveTime = 1
		}
		if solveTime > 6*TargetBlockTime {
			solveTime = 6 * TargetBlockTime
		}
		weight := int64(i)
		weightedSum += solveTime * weight
		divisor += weight
	}

	avg := weightedSum / divisor
	if avg < 1 {
		avg = 1
	}

	next := uint64(float64(current) * float64(TargetBlockTime) / float64(avg))

	// Cap per-window change at 4× in either direction.
	if next > current*4 {
		next = current * 4
	}
	if next < current/4 {
		next = current / 4
	}
	if next < InitialDifficulty {
		next = InitialDifficulty
	}
	return next
}
