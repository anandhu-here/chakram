# Chakram Web App

React + Vite frontend for the Chakram node. Embedded into the Go binary at build time via `go:embed` — no separate web server needed. Served directly from the node at the RPC port.

## Pages

| Route | Description |
|-------|-------------|
| `/` | Block explorer — live chain, recent blocks, search |
| `/wallet` | Browser-based wallet — send, receive, balance |
| `/faucet` | Testnet faucet |
| `/download` | Download page for binaries |
| `/docs` | API reference |

## Development

```bash
cd web
npm install
npm run dev        # dev server at localhost:5173 (proxies API calls to localhost:8339)
```

## Building

```bash
npm run build      # outputs to web/dist/
```

The Go build embeds `web/dist/` automatically. Run `npm run build` before `go build` to include the latest frontend.

## Stack

- React 18
- Vite
- CSS modules (no UI framework)
- Ed25519 key derivation via BIP39 in-browser (`src/lib/walletCrypto.js`)
