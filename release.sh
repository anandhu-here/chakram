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

# Step 1 — Build all 3 platforms
echo "Building binaries..."
go build -o chakram-mac .
GOOS=linux GOARCH=amd64 go build -o chakram-linux .
GOOS=windows GOARCH=amd64 go build -o chakram-windows.exe .
echo "  ✓ chakram-mac"
echo "  ✓ chakram-linux"
echo "  ✓ chakram-windows.exe"

# Step 2 — Deploy to GCP
echo "Deploying to GCP..."
./deploy.sh

# Step 3 — Git commit and tag
echo "Tagging release..."
git add .
git commit -m "Release $VERSION — $NOTES"
git push
git tag $VERSION
git push origin $VERSION

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
