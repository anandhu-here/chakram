#!/bin/bash
set -e

SEED1="35.207.229.32"
SEED2="34.1.166.49"
SEED3="35.207.217.64"
BINARY="./chakram-linux"
REMOTE_USER="${CHAKRAM_SSH_USER:-anandhusathe}"   # override: CHAKRAM_SSH_USER=myuser ./deploy.sh
REMOTE_BIN="/home/$REMOTE_USER/chakram"
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

echo "Building web app..."
(cd web && npm run build)
echo "  ✓ web/dist"

echo "Building Linux binary..."
GOOS=linux GOARCH=amd64 go build -o chakram-linux .

# ── Rolling deploy — one seed at a time ───────────────────────────────────────
# Keeps at least 2 seeds live at all times so the network never goes dark.
# Protocol-breaking upgrades (MinProtocolVersion bump) still need a coordinated
# cutover; rolling is safe for all normal binary updates.

wait_healthy() {
  local host=$1
  local label=$2
  local deadline=$((SECONDS + 60))
  printf "  waiting for %s to come up" "$label"
  while [ $SECONDS -lt $deadline ]; do
    peers=$(ssh $SSH_OPTS $REMOTE_USER@$host "curl -s http://localhost:8339/info 2>/dev/null | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d.get('peers',0))\" 2>/dev/null" 2>/dev/null || echo "0")
    if [ "$peers" -ge 1 ] 2>/dev/null; then
      echo " ✓ (peers=$peers)"
      return 0
    fi
    printf "."
    sleep 3
  done
  echo " ✗ (timeout — continuing anyway)"
  return 0
}

deploy_seed() {
  local host=$1
  local label=$2

  echo ""
  echo "── $label ($host) ──"

  echo "  stopping..."
  ssh $SSH_OPTS $REMOTE_USER@$host \
    "sudo systemctl stop chakram-mainnet 2>/dev/null || sudo systemctl stop chakram-seed 2>/dev/null || sudo systemctl stop chakram-miner 2>/dev/null || true"
  sleep 2

  echo "  copying binary..."
  ssh $SSH_OPTS $REMOTE_USER@$host "rm -f $REMOTE_BIN"
  scp $SSH_OPTS $BINARY $REMOTE_USER@$host:$REMOTE_BIN
  ssh $SSH_OPTS $REMOTE_USER@$host "chmod +x $REMOTE_BIN"

  echo "  installing service..."
  sed "s|User=ubuntu|User=$REMOTE_USER|g; s|/home/ubuntu/|/home/$REMOTE_USER/|g" \
    deploy/chakram-mainnet.service | ssh $SSH_OPTS $REMOTE_USER@$host \
    "sudo tee /etc/systemd/system/chakram-mainnet.service > /dev/null && \
     sudo systemctl daemon-reload && \
     sudo systemctl enable chakram-mainnet"

  if [ "$WIPE" = true ]; then
    echo "  wiping chain data..."
    ssh $SSH_OPTS $REMOTE_USER@$host "rm -rf ~/.chakram/ && echo '  wiped'"
  fi

  echo "  starting..."
  ssh $SSH_OPTS $REMOTE_USER@$host "sudo systemctl start chakram-mainnet"

  wait_healthy "$host" "$label"
}

deploy_seed "$SEED1" "seed-1"
deploy_seed "$SEED2" "seed-2"
deploy_seed "$SEED3" "seed-3"

# ── Nginx on seed-2 (chakram.one) ─────────────────────────────────────────────
# Only install/overwrite nginx config on first setup (before certbot runs).
# Once SSL certs exist, certbot owns the nginx config — we must not overwrite it
# or HTTPS breaks. Subsequent deploys just reload nginx.

echo ""
echo "Configuring nginx on seed-2..."
ssh $SSH_OPTS $REMOTE_USER@$SEED2 "which nginx >/dev/null 2>&1 || sudo apt-get install -y nginx -q"
ssh $SSH_OPTS $REMOTE_USER@$SEED2 "
  if ! sudo grep -q 'ssl_certificate' /etc/nginx/sites-available/chakram.one 2>/dev/null; then
    sudo tee /etc/nginx/sites-available/chakram.one > /dev/null << 'NGINXEOF'
$(cat deploy/nginx-chakram.one.conf)
NGINXEOF
    sudo ln -sf /etc/nginx/sites-available/chakram.one /etc/nginx/sites-enabled/chakram.one
    sudo rm -f /etc/nginx/sites-enabled/default
    sudo nginx -t && sudo systemctl enable --now nginx && sudo systemctl reload nginx
    echo '  nginx configured (initial setup — run certbot to enable HTTPS)'
  else
    sudo nginx -t && sudo systemctl reload nginx
    echo '  nginx reloaded (SSL active)'
  fi
"

# ── Nginx subdomains on seed-2 ────────────────────────────────────────────────

ssh $SSH_OPTS $REMOTE_USER@$SEED2 "
  if ! sudo grep -q 'ssl_certificate' /etc/nginx/sites-available/chakram-subdomains 2>/dev/null; then
    sudo tee /etc/nginx/sites-available/chakram-subdomains > /dev/null << 'NGINXEOF'
$(cat deploy/nginx-subdomains.conf)
NGINXEOF
    sudo ln -sf /etc/nginx/sites-available/chakram-subdomains /etc/nginx/sites-enabled/chakram-subdomains
    sudo nginx -t && sudo systemctl reload nginx
    echo '  subdomains nginx configured (run certbot to enable HTTPS)'
  else
    sudo nginx -t && sudo systemctl reload nginx
    echo '  subdomains nginx reloaded (SSL active)'
  fi
"

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
echo "  ssh $REMOTE_USER@$SEED2 'sudo certbot --nginx -d chakram.one -d www.chakram.one'"
