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

# GUI apps (Mac + Windows) are built automatically by GitHub Actions
# (.github/workflows/build-gui.yml) and uploaded to this release within ~5 minutes.

echo ""
echo "=== Release $VERSION complete ==="
echo "GitHub: https://github.com/anandhu-here/chakram/releases/tag/$VERSION"
echo ""
echo "CLI binaries ready. GUI apps building via GitHub Actions (~5 min):"
echo "  https://github.com/anandhu-here/chakram/actions"
