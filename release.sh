#!/bin/bash
set -e

# Usage: ./release.sh <version> <release-notes>
# Example: ./release.sh v0.1.3 "send command implemented"

VERSION=$1
NOTES=$2

if [ -z "$VERSION" ]; then
  echo "Usage: ./release.sh <version> <notes>"
  echo "Example: ./release.sh v0.1.3 'send command implemented'"
  exit 1
fi

echo "=== Chakram Release $VERSION ==="

# Step 1 — Git commit and tag first (so deploy gets the right code)
echo "Committing and tagging..."
git add .
git commit -m "Release $VERSION — $NOTES" || echo "  (nothing to commit)"
git push
git tag $VERSION
git push origin $VERSION

# Step 2 — Deploy to GCP
# deploy.sh rebuilds chakram-linux internally — let it finish before we upload
echo "Deploying to GCP..."
./deploy.sh

# Step 3 — Build all 3 platform binaries AFTER deploy finishes
# This avoids a race where deploy.sh overwrites chakram-linux mid-upload
echo "Building release binaries..."
go build -o chakram-mac .
GOOS=linux GOARCH=amd64 go build -o chakram-linux .
GOOS=windows GOARCH=amd64 go build -o chakram-windows.exe .
echo "  ✓ chakram-mac"
echo "  ✓ chakram-linux"
echo "  ✓ chakram-windows.exe"

# Step 4 — GitHub release
echo "Creating GitHub release..."
gh release create $VERSION \
  chakram-mac \
  chakram-linux \
  chakram-windows.exe \
  --title "Chakram $VERSION" \
  --notes "$NOTES"

echo ""
echo "=== Release $VERSION complete ==="
echo "GitHub: https://github.com/anandhu-here/chakram/releases/tag/$VERSION"
echo ""
echo "Download and test:"
echo "  Mac:     chmod +x chakram-mac && xattr -d com.apple.quarantine chakram-mac && ./chakram-mac node --testnet"
echo "  Linux:   chmod +x chakram-linux && ./chakram-linux node --testnet"
echo "  Windows: chakram-windows.exe node --testnet"
