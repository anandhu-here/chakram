# RandomX (Golang Implementation)

Fork from [git.dero.io/DERO_Foundation/RandomX](https://git.dero.io/DERO_Foundation/RandomX). Also related, their [Analysis of RandomX writeup](https://medium.com/deroproject/analysis-of-randomx-dde9dfe9bbc6).

Original code failed RandomX testcases and was implemented using big.Float.

This package implements RandomX without CGO, using only Golang code, pure float64 ops and two small assembly sections to implement CFROUND for amd64/arm64. Test cases pass properly.