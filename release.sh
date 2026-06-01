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

# Collect any extra flags (e.g. --wipe) to forward to deploy.sh
DEPLOY_FLAGS=""
for arg in "$@"; do
  if [[ "$arg" == --* ]]; then
    DEPLOY_FLAGS="$DEPLOY_FLAGS $arg"
  fi
done

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

# ── Build React web app ───────────────────────────────────────────────────────
# Must run before git add so web/dist/ (embedded into the Go binary) is committed.

echo "Building web app..."
(cd web && npm run build)
echo "  ✓ web/dist"

# ── Git commit and tag ────────────────────────────────────────────────────────

echo "Committing and tagging..."
git add .
git commit -m "Release $VERSION — $NOTES" || echo "  (nothing new to commit)"
git push -u origin main

# Force-overwrite the tag in case it already exists locally or remotely
git tag -f "$VERSION"
git push origin "refs/tags/$VERSION" --force

# ── Deploy to GCP ─────────────────────────────────────────────────────────────

echo "Deploying to GCP..."
./deploy.sh $DEPLOY_FLAGS

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

# ── Build Intel Mac GUI and upload to GCS ─────────────────────────────────────

GCP_KEY="$(dirname "$0")/gcp-key.json"
if [ ! -f "$GCP_KEY" ]; then
  echo ""
  echo "  ⚠  gcp-key.json not found — skipping Intel Mac GUI build."
  echo "     Place your GCP service account key at: $GCP_KEY"
else
  echo "Building Intel Mac GUI..."
  cp chakram-mac gui/chakram
  cp assets/chakram.png gui/chakram.png
  chmod +x gui/chakram
  cd gui
  rm -rf dist/ build/ Chakram.spec
  python3 -m PyInstaller \
    --onedir \
    --windowed \
    --name "Chakram" \
    --add-binary "chakram:." \
    --add-data "chakram.png:." \
    --hidden-import customtkinter \
    --hidden-import PIL \
    --hidden-import "PIL._tkinter_finder" \
    chakram_gui.py
  cd dist && zip -r Chakram-mac-intel.zip Chakram.app && cd ../..
  echo "  ✓ Chakram-mac-intel.zip"

  echo "Uploading Intel Mac GUI to GCS..."
  gcloud auth activate-service-account --key-file="$GCP_KEY" --quiet
  gsutil cp gui/dist/Chakram-mac-intel.zip "gs://chakram-dist/$VERSION/Chakram-mac-intel.zip"
  gsutil cp gui/dist/Chakram-mac-intel.zip "gs://chakram-dist/latest/Chakram-mac-intel.zip"
  gsutil setmeta -h "Cache-Control:no-cache, no-store" \
    "gs://chakram-dist/latest/Chakram-mac-intel.zip" 2>/dev/null || true
  echo "  ✓ uploaded to gs://chakram-dist/latest/Chakram-mac-intel.zip"
fi

echo ""
echo "=== Release $VERSION complete ==="
echo "GitHub: https://github.com/anandhu-here/chakram/releases/tag/$VERSION"
echo ""
echo "Intel Mac GUI: built locally and uploaded to GCS."
echo "Apple Silicon + Windows GUI building via GitHub Actions (~5 min):"
echo "  https://github.com/anandhu-here/chakram/actions"
