#!/bin/bash
set -e

# Builds the Chakram Android wallet APK and uploads it to GCS.
#
# Usage:
#   ./release-mobile.sh              — use latest git tag
#   ./release-mobile.sh v1.0.44     — specific version tag

TAG="${1:-$(git tag --sort=-version:refname | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | head -1)}"

if [ -z "$TAG" ]; then
  echo "Error: no release tag found. Pass one explicitly: ./release-mobile.sh v1.0.44"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
GCS_BUCKET="chakram-dist"
GCP_KEY="$SCRIPT_DIR/gcp-key.json"
MOBILE_DIR="$SCRIPT_DIR/mobile-wallet"
APK_SRC="$MOBILE_DIR/android/app/build/outputs/apk/release/app-release.apk"
APK_NAME="chakram-wallet-unsigned.apk"

echo "=== Chakram Mobile Release — $TAG ==="
echo ""

# ── Prebuild (sync android folder from current Expo config) ───────────────────

echo "Running expo prebuild..."
cd "$MOBILE_DIR"
npx expo prebuild --platform android --no-install
echo "  ✓ prebuild complete"

# ── Build release APK ─────────────────────────────────────────────────────────

echo "Building release APK..."
cd "$MOBILE_DIR/android"
./gradlew assembleRelease
echo "  ✓ APK built"

# ── Copy and rename ───────────────────────────────────────────────────────────

cp "$APK_SRC" "$MOBILE_DIR/$APK_NAME"
echo "  ✓ $APK_NAME"

# ── Upload to GCS ─────────────────────────────────────────────────────────────

if [ ! -f "$GCP_KEY" ]; then
  echo ""
  echo "  ⚠  gcp-key.json not found — skipping GCS upload."
  echo "     APK is at: $MOBILE_DIR/$APK_NAME"
  exit 0
fi

echo "Uploading to GCS..."
gcloud auth activate-service-account --key-file="$GCP_KEY" --quiet
gsutil cp "$MOBILE_DIR/$APK_NAME" "gs://$GCS_BUCKET/$TAG/$APK_NAME"
gsutil cp "$MOBILE_DIR/$APK_NAME" "gs://$GCS_BUCKET/latest/$APK_NAME"
gsutil setmeta -h "Cache-Control:no-cache, no-store" \
  "gs://$GCS_BUCKET/latest/$APK_NAME" 2>/dev/null || true
echo "  ✓ uploaded gs://$GCS_BUCKET/latest/$APK_NAME"

echo ""
echo "=== Mobile release $TAG complete ==="
echo "Download: https://storage.googleapis.com/$GCS_BUCKET/latest/$APK_NAME"
