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

# Step 4 — GitHub release (node binaries only first)
echo "Creating GitHub release..."
gh release create $VERSION \
  chakram-mac \
  chakram-linux \
  chakram-windows.exe \
  --title "Chakram $VERSION" \
  --notes "$NOTES"

# Step 5 — Build Mac GUI app and upload to release
echo "Building GUI (Mac)..."
cd gui
cp ../chakram-mac ./chakram
chmod +x ./chakram
rm -rf dist/ build/ Chakram.spec 2>/dev/null || true
pip3 install pyinstaller customtkinter requests pillow -q 2>/dev/null
python3 -m PyInstaller \
  --onedir \
  --windowed \
  --name "Chakram" \
  --add-binary "chakram:." \
  --hidden-import customtkinter \
  --hidden-import PIL \
  --hidden-import PIL._tkinter_finder \
  chakram_gui.py 2>/dev/null
# Package .app as zip for GitHub upload
if [ -d "dist/Chakram.app" ]; then
  zip -r dist/Chakram-mac.zip dist/Chakram.app 2>/dev/null
fi
cd ..

if [ -f "gui/dist/Chakram-mac.zip" ]; then
  gh release upload $VERSION gui/dist/Chakram-mac.zip --clobber 2>/dev/null \
    && echo "  ✓ Chakram GUI (Mac) added to release"
else
  echo "  ⚠ GUI build failed — skipping upload (node binaries already uploaded)"
fi
echo "  Note: Windows GUI must be built on Windows — see gui/README.md"

echo ""
echo "=== Release $VERSION complete ==="
echo "GitHub: https://github.com/anandhu-here/chakram/releases/tag/$VERSION"
echo ""
echo "Download and test:"
echo "  Mac:     chmod +x chakram-mac && xattr -d com.apple.quarantine chakram-mac && ./chakram-mac node --testnet"
echo "  Linux:   chmod +x chakram-linux && ./chakram-linux node --testnet"
echo "  Windows: chakram-windows.exe node --testnet"
