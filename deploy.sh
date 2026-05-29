#!/bin/bash
set -e

SEED1="35.207.229.32"
SEED2="34.1.166.49"
MINER="35.207.217.64"
BINARY="./chakram-linux"
REMOTE_PATH="/home/anandhusathe/chakram"
SSH_OPTS="-o StrictHostKeyChecking=no -o ConnectTimeout=10 -o BatchMode=yes"

# Parse --wipe flag. Only needed when storage format, genesis, or serialization changes.
WIPE=false
for arg in "$@"; do
  if [ "$arg" = "--wipe" ]; then
    WIPE=true
  fi
done

echo "=== Deploying Chakram to GCP VMs ==="
if [ "$WIPE" = true ]; then
  echo "    (--wipe: testnet chain data will be erased)"
fi

# Build fresh Linux binary first
echo "Building Linux binary..."
GOOS=linux GOARCH=amd64 go build -o chakram-linux .

# Stop all services before copying
echo "Stopping services..."
ssh $SSH_OPTS anandhusathe@$SEED1 "sudo systemctl stop chakram-seed || true"
ssh $SSH_OPTS anandhusathe@$SEED2 "sudo systemctl stop chakram-seed || true"
ssh $SSH_OPTS anandhusathe@$MINER "sudo systemctl stop chakram-miner || true"

# Copy binary to all VMs
echo "Copying binary..."
scp $SSH_OPTS $BINARY anandhusathe@$SEED1:$REMOTE_PATH
ssh $SSH_OPTS anandhusathe@$SEED1 "chmod +x $REMOTE_PATH"
echo "  chakram-seed-1 done"

scp $SSH_OPTS $BINARY anandhusathe@$SEED2:$REMOTE_PATH
ssh $SSH_OPTS anandhusathe@$SEED2 "chmod +x $REMOTE_PATH"
echo "  chakram-seed-2 done"

scp $SSH_OPTS $BINARY anandhusathe@$MINER:$REMOTE_PATH
ssh $SSH_OPTS anandhusathe@$MINER "chmod +x $REMOTE_PATH"
echo "  chakram-miner-1 done"

# Wipe testnet chain data only when explicitly requested.
# Required for: storage format changes, genesis block changes, serialization changes.
# NOT required for: bug fixes, performance improvements, new RPC endpoints.
if [ "$WIPE" = true ]; then
  echo "Wiping testnet chain data..."
  ssh $SSH_OPTS anandhusathe@$SEED1 "rm -rf ~/.chakram/testnet/ && echo '  seed-1 wiped'"
  ssh $SSH_OPTS anandhusathe@$SEED2 "rm -rf ~/.chakram/testnet/ && echo '  seed-2 wiped'"
  ssh $SSH_OPTS anandhusathe@$MINER \
    "find ~/.chakram/testnet/ -mindepth 1 -not -name 'wallet.json' -delete 2>/dev/null; echo '  miner wiped (wallet kept)'"
fi

# Start all services
echo "Starting services..."
ssh $SSH_OPTS anandhusathe@$SEED1 "sudo systemctl start chakram-seed"
ssh $SSH_OPTS anandhusathe@$SEED2 "sudo systemctl start chakram-seed"
ssh $SSH_OPTS anandhusathe@$MINER "sudo systemctl start chakram-miner"

echo "=== Deployment complete ==="
