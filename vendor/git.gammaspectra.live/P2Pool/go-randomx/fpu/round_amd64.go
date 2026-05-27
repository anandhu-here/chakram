//go:build amd64

package fpu

// stmxcsr reads the MXCSR control and status register.
//
//go:noescape
func stmxcsr(addr *uint32)

// ldmxcsr writes to the MXCSR control and status register.
//
//go:noescape
func ldmxcsr(addr *uint32)

func setRoundingMode(mode uint8) {
	var csr uint32
	stmxcsr(&csr)
	csr = (csr & (^uint32(0x6000))) | ((uint32(mode) & 3) << 13)
	ldmxcsr(&csr)
}
