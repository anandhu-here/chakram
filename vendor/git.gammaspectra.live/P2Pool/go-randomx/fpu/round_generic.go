//go:build !arm64 && !amd64

package fpu

func setRoundingMode(mode uint8) {
	panic("not implemented")
}
