#!/bin/bash
set -e

SEED1="35.207.229.32"
SEED2="34.1.166.49"
SEED3="35.207.217.64"
BINARY="./chakram-linux"
REMOTE_BIN="/home/anandhusathe/chakram"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes"

# --wipe flag: erases all mainnet chain data for a clean genesis start.
# Use only for initial mainnet launch or a full reset. Never use in normal updates.
WIPE=false
for arg in "$@"; do
  if [ "$arg" = "--wipe" ]; then
    WIPE=true
  fi
done

echo "=== Deploying Chakram Mainnet to GCP VMs ==="
if [ "$WIPE" = true ]; then
  echo "    (--wipe: all chain data will be erased for clean genesis)"
fi

# ── Build ─────────────────────────────────────────────────────────────────────

echo "Building Linux binary..."
GOOS=linux GOARCH=amd64 go build -o chakram-linux .

# ── Stop services ─────────────────────────────────────────────────────────────

echo "Stopping services..."
ssh $SSH_OPTS anandhusathe@$SEED1 "sudo systemctl stop chakram-mainnet 2>/dev/null || sudo systemctl stop chakram-seed 2>/dev/null || true"
ssh $SSH_OPTS anandhusathe@$SEED2 "sudo systemctl stop chakram-mainnet 2>/dev/null || sudo systemctl stop chakram-seed 2>/dev/null || true"
ssh $SSH_OPTS anandhusathe@$SEED3 "sudo systemctl stop chakram-mainnet 2>/dev/null || sudo systemctl stop chakram-miner 2>/dev/null || true"
sleep 5

# ── Copy binary ───────────────────────────────────────────────────────────────

echo "Copying binary..."
scp $SSH_OPTS $BINARY anandhusathe@$SEED1:$REMOTE_BIN && ssh $SSH_OPTS anandhusathe@$SEED1 "chmod +x $REMOTE_BIN" && echo "  seed-1 done"
scp $SSH_OPTS $BINARY anandhusathe@$SEED2:$REMOTE_BIN && ssh $SSH_OPTS anandhusathe@$SEED2 "chmod +x $REMOTE_BIN" && echo "  seed-2 done"
scp $SSH_OPTS $BINARY anandhusathe@$SEED3:$REMOTE_BIN && ssh $SSH_OPTS anandhusathe@$SEED3 "chmod +x $REMOTE_BIN" && echo "  seed-3 done"

# ── Install mainnet service ───────────────────────────────────────────────────

echo "Installing mainnet service..."
for HOST in $SEED1 $SEED2 $SEED3; do
  scp $SSH_OPTS deploy/chakram-mainnet.service anandhusathe@$HOST:~/chakram-mainnet.service
  ssh $SSH_OPTS anandhusathe@$HOST \
    "sudo cp ~/chakram-mainnet.service /etc/systemd/system/chakram-mainnet.service && \
     sudo systemctl daemon-reload && \
     sudo systemctl enable chakram-mainnet"
done
echo "  service installed on all 3 nodes"

# ── Wipe chain data (launch only) ────────────────────────────────────────────

if [ "$WIPE" = true ]; then
  echo "Wiping chain data..."
  ssh $SSH_OPTS anandhusathe@$SEED1 "rm -rf ~/.chakram/ && echo '  seed-1 wiped'"
  ssh $SSH_OPTS anandhusathe@$SEED2 "rm -rf ~/.chakram/ && echo '  seed-2 wiped'"
  ssh $SSH_OPTS anandhusathe@$SEED3 "rm -rf ~/.chakram/ && echo '  seed-3 wiped'"
fi

# ── Nginx on seed-2 (chakram.one) ─────────────────────────────────────────────
# Only install/overwrite nginx config on first setup (before certbot runs).
# Once SSL certs exist, certbot owns the nginx config — we must not overwrite it
# or HTTPS breaks. Subsequent deploys just reload nginx.

echo "Configuring nginx on seed-2..."
ssh $SSH_OPTS anandhusathe@$SEED2 "which nginx >/dev/null 2>&1 || sudo apt-get install -y nginx -q"
ssh $SSH_OPTS anandhusathe@$SEED2 "
  if [ ! -f /etc/letsencrypt/live/chakram.one/fullchain.pem ]; then
    sudo tee /etc/nginx/sites-available/chakram.one > /dev/null << 'NGINXEOF'
$(cat deploy/nginx-chakram.one.conf)
NGINXEOF
    sudo ln -sf /etc/nginx/sites-available/chakram.one /etc/nginx/sites-enabled/chakram.one
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
    echo '  nginx configured (initial setup — run certbot to enable HTTPS)'
  else
    sudo systemctl enable --now nginx && sudo nginx -t && sudo systemctl reload nginx
    echo '  nginx reloaded (SSL active)'
  fi
"

# ── Start nodes in order ──────────────────────────────────────────────────────

echo "Starting seed-1..."
ssh $SSH_OPTS anandhusathe@$SEED1 "sudo systemctl start chakram-mainnet"

echo "Starting seed-2..."
ssh $SSH_OPTS anandhusathe@$SEED2 "sudo systemctl start chakram-mainnet"

echo "Waiting for seeds to initialize..."
sleep 15

echo "Starting seed-3..."
ssh $SSH_OPTS anandhusathe@$SEED3 "sudo systemctl start chakram-mainnet"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "=== Deployment complete ==="
echo ""
echo "Health check:"
echo "  curl http://$SEED1:8339/info"
echo "  curl http://$SEED2:8339/info"
echo "  curl http://$SEED3:8339/info"
echo ""
echo "  Note: HTTPS for chakram.one requires a one-time certbot run on seed-2:"
echo "  ssh anandhusathe@$SEED2 'sudo certbot --nginx -d chakram.one -d www.chakram.one'"
