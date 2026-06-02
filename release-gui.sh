#!/bin/bash
set -e

# Rebuilds GUI apps only — no version bump, no VM deploy, no git commit.
# Uses the latest release tag (or pass one explicitly).
#
# Usage:
#   ./release-gui.sh            — rebuild GUIs for latest tag
#   ./release-gui.sh v1.0.31   — rebuild GUIs for specific tag

TAG="${1:-$(git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)}"

if [ -z "$TAG" ]; then
  echo "Error: no release tag found. Pass one explicitly: ./release-gui.sh v1.0.31"
  exit 1
fi

GCS_BUCKET="chakram-dist"
GCP_KEY="$(dirname "$0")/gcp-key.json"

echo "=== Chakram GUI Rebuild — $TAG ==="
echo ""

# ── Intel Mac GUI (built locally) ─────────────────────────────────────────────

if [ ! -f "$GCP_KEY" ]; then
  echo "  ⚠  gcp-key.json not found — skipping Intel Mac GUI build."
  echo "     Place your GCP service account key at: $GCP_KEY"
else
  echo "Building Intel Mac GUI…"

  # Need a fresh chakram-mac binary matching this tag
  go build -o chakram-mac .

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

  echo "Uploading Intel Mac GUI to GCS…"
  gcloud auth activate-service-account --key-file="$GCP_KEY" --quiet
  gsutil cp gui/dist/Chakram-mac-intel.zip "gs://$GCS_BUCKET/$TAG/Chakram-mac-intel.zip"
  gsutil cp gui/dist/Chakram-mac-intel.zip "gs://$GCS_BUCKET/latest/Chakram-mac-intel.zip"
  gsutil setmeta -h "Cache-Control:no-cache, no-store" \
    "gs://$GCS_BUCKET/latest/Chakram-mac-intel.zip" 2>/dev/null || true
  echo "  ✓ uploaded gs://chakram-dist/latest/Chakram-mac-intel.zip"
fi

# ── ARM + Windows GUIs (GitHub Actions) ───────────────────────────────────────

echo ""
echo "Triggering GitHub Actions GUI build for $TAG…"
gh workflow run build-gui.yml --ref main --field tag="$TAG"
echo "  ✓ workflow triggered"

echo ""
echo "=== Done ==="
echo "  Intel GUI : built locally (if gcp-key.json present)"
echo "  ARM GUI   : building on GitHub Actions (~5 min)"
echo "  Windows   : building on GitHub Actions (~5 min)"
echo ""
echo "Watch progress: https://github.com/anandhu-here/chakram/actions"
