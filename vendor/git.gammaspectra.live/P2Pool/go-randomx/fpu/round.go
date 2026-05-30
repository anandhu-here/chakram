package fpu

type RoundingMode uint8

const (
	RoundingModeToNearest = RoundingMode(iota)
	RoundingModeToNegative
	RoundingModeToPositive
	RoundingModeToZero
)

func SetRoundingMode(mode RoundingMode) {
	setRoundingMode(uint8(mode))
}
