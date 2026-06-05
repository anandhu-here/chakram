#!/bin/bash
set -e

# deploy-ui.sh — Rebuild the web UI and push it to seed-2 (chakram.one) only.
#
# Use this when you only changed web/src/* and don't need a full release.
# Seed-1 and seed-3 are not touched — the chain keeps running uninterrupted.
# Seed-2 restarts briefly (~5s) to pick up the new binary with embedded UI.
#
# Usage:
#   ./deploy-ui.sh

WEB_NODE="34.1.166.49"
REMOTE_USER="${CHAKRAM_SSH_USER:-anandhusathe}"   # override: CHAKRAM_SSH_USER=myuser ./deploy-ui.sh
REMOTE_BIN="/home/$REMOTE_USER/chakram"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes"

echo "=== Chakram UI Deploy → seed-2 (chakram.one) ==="
echo "  Seed-1 and seed-3 will NOT be touched."
echo ""

# ── Build web app ─────────────────────────────────────────────────────────────

echo "Building web app..."
(cd web && npm run build)
echo "  ✓ web/dist"

# ── Build Linux binary (embeds fresh web/dist) ────────────────────────────────

echo "Building Linux binary..."
GOOS=linux GOARCH=amd64 go build -o chakram-linux .
echo "  ✓ chakram-linux"

# ── Stop seed-2 ───────────────────────────────────────────────────────────────

echo "Stopping seed-2..."
ssh $SSH_OPTS $REMOTE_USER@$WEB_NODE \
  "sudo systemctl stop chakram-mainnet 2>/dev/null || sudo systemctl stop chakram-seed 2>/dev/null || true"

# ── Push binary ───────────────────────────────────────────────────────────────

echo "Copying binary to seed-2..."
scp $SSH_OPTS ./chakram-linux $REMOTE_USER@$WEB_NODE:$REMOTE_BIN
ssh $SSH_OPTS $REMOTE_USER@$WEB_NODE "chmod +x $REMOTE_BIN"
echo "  ✓ binary uploaded"

# ── Start seed-2 ──────────────────────────────────────────────────────────────

echo "Starting seed-2..."
ssh $SSH_OPTS $REMOTE_USER@$WEB_NODE "sudo systemctl start chakram-mainnet"

# ── Reload nginx (picks up any config reload, does NOT overwrite SSL certs) ───

echo "Reloading nginx..."
ssh $SSH_OPTS $REMOTE_USER@$WEB_NODE "sudo nginx -t && sudo systemctl reload nginx"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "=== UI deploy complete ==="
echo ""
echo "  chakram.one should be live in ~10 seconds (seed-2 peer reconnect)"
echo ""
echo "  Verify:"
echo "    curl -s https://chakram.one/info | python3 -m json.tool | grep height"
