#include "textflag.h"

// stmxcsr reads the MXCSR control and status register.
TEXT ·stmxcsr(SB),NOSPLIT|NOFRAME,$0-8
	MOVQ addr+0(FP), SI
	STMXCSR (SI)
	RET

// ldmxcsr writes to the MXCSR control and status register.
TEXT ·ldmxcsr(SB),NOSPLIT|NOFRAME,$0-8
	MOVQ addr+0(FP), SI
	LDMXCSR (SI)
	RET
