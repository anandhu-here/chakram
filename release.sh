#!/bin/bash
set -e

# Usage:
#   ./release.sh                        — auto-bump patch, timestamp message
#   ./release.sh "my notes"             — auto-bump patch, custom message
#   ./release.sh v0.2.16                — specific version, timestamp message
#   ./release.sh v0.2.16 "my notes"     — specific version, custom message

# ── Version resolution ────────────────────────────────────────────────────────

# Fetch tags from remote so we always see the latest
git fetch --tags --quiet 2>/dev/null || true

LATEST=$(git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)
if [ -z "$LATEST" ]; then
  LATEST="v0.0.0"
fi

# Parse major.minor.patch and bump patch
IFS='.' read -r V_MAJOR V_MINOR V_PATCH <<< "${LATEST#v}"
AUTO_VERSION="v${V_MAJOR}.${V_MINOR}.$((V_PATCH + 1))"

# Detect if first arg looks like a version tag
if [[ "$1" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  VERSION="$1"
  NOTES="${2:-}"
else
  VERSION="$AUTO_VERSION"
  NOTES="${1:-}"
fi

# Auto-generate message if none given
if [ -z "$NOTES" ]; then
  NOTES="$(date '+%Y-%m-%d %H:%M') release $VERSION"
fi

echo "=== Chakram Release $VERSION ==="
echo "  Previous : $LATEST"
echo "  Message  : $NOTES"
echo ""

# ── Sync GUI version ──────────────────────────────────────────────────────────

GUI_FILE="gui/chakram_gui.py"
if [ -f "$GUI_FILE" ]; then
  sed -i '' "s|VERSION   = \"v[0-9]*\.[0-9]*\.[0-9]*\"|VERSION   = \"$VERSION\"|" "$GUI_FILE"
  echo "  ✓ GUI version → $VERSION"
fi

# ── Git commit and tag ────────────────────────────────────────────────────────

echo "Committing and tagging..."
git add .
git commit -m "Release $VERSION — $NOTES" || echo "  (nothing new to commit)"
git push

# Force-overwrite the tag in case it already exists locally or remotely
git tag -f "$VERSION"
git push origin "refs/tags/$VERSION" --force

# ── Deploy to GCP ─────────────────────────────────────────────────────────────

echo "Deploying to GCP..."
./deploy.sh

# ── Build all 3 platform binaries ─────────────────────────────────────────────
# Done AFTER deploy so deploy.sh can't overwrite chakram-linux mid-upload

echo "Building release binaries..."
go build -o chakram-mac .
GOOS=linux GOARCH=amd64 go build -o chakram-linux .
GOOS=windows GOARCH=amd64 go build -o chakram-windows.exe .
echo "  ✓ chakram-mac"
echo "  ✓ chakram-linux"
echo "  ✓ chakram-windows.exe"

# ── GitHub release ────────────────────────────────────────────────────────────

echo "Creating GitHub release..."
gh release create "$VERSION" \
  chakram-mac \
  chakram-linux \
  chakram-windows.exe \
  --title "Chakram $VERSION" \
  --notes "$NOTES"

# ── Build and upload Mac GUI app ──────────────────────────────────────────────

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
if [ -d "dist/Chakram.app" ]; then
  zip -r dist/Chakram-mac.zip dist/Chakram.app 2>/dev/null
fi
cd ..

if [ -f "gui/dist/Chakram-mac.zip" ]; then
  gh release upload "$VERSION" gui/dist/Chakram-mac.zip --clobber 2>/dev/null \
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
