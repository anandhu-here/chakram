# Contributing to Chakram

Thanks for your interest in contributing. Chakram is built from scratch in Go — no framework, no forks, every line is intentional.

## Ways to contribute

- **Run a node** — the most valuable thing right now is more nodes on the network
- **Run a seed** — start with `--seed-mode`, add DNS A records, open a PR to add your hostname to `DNSSeeds` in `config.go`
- **Report bugs** — open a GitHub issue with your OS, binary version (`./chakram --version`), and the exact error
- **Fix bugs** — pick an open issue, comment that you're working on it, open a PR
- **Improve the web frontend** — the explorer and wallet live in `web/src/`
- **Add checkpoints** — once the chain has stabilised at a new height, propose a checkpoint addition to `config.go`

## Building from source

Requires Go 1.21+ and Node 18+ (for the web frontend).

```bash
git clone https://github.com/anandhu-here/chakram
cd chakram

# Install web dependencies and build the frontend
cd web && npm install && npm run build && cd ..

# Build the node binary (CGo enabled — requires a C compiler for RandomX)
go build -o chakram .

# Run
./chakram node
```

Pre-built RandomX static libraries are vendored in `lib/` for macOS Intel/ARM, Linux AMD64, and Windows AMD64. No separate library install needed.

## Code style

- Standard Go formatting — run `gofmt` before committing
- No external frameworks for the core node — keep dependencies minimal
- No comments explaining what the code does — only comments explaining why (non-obvious constraints, invariants, workarounds)
- No half-finished features — if it's not ready, don't merge it

## Pull request process

1. Fork the repo and create a branch from `main`
2. Make your change — keep PRs focused on one thing
3. Verify the node builds and starts: `go build . && ./chakram node`
4. Open a PR with a clear description of what changed and why
5. A maintainer will review within a few days

## Adding a DNS seed

If you're running a reliable seed node and want to add your hostname:

1. Start your node with `--seed-mode`
2. Set up DNS A records pointing to your server IP
3. Open a PR editing the `DNSSeeds` slice in `config.go`:

```go
var DNSSeeds = []string{
    "seeds.chakram.one",       // Chakram core team
    "seeds.yourdomain.com",    // your name / handle
}
```

Each operator controls their own hostname and A records independently.

## Questions

Open a GitHub issue or reach out via the community channels linked on [chakram.one](https://chakram.one).
