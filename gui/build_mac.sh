#!/bin/bash
set -e
echo "Building Chakram.app for Mac..."

pip3 install pyinstaller customtkinter requests pillow -q

# Copy chakram binary into gui folder
cp ../chakram-mac ./chakram
chmod +x ./chakram

# Clean previous build artifacts
rm -rf dist/ build/ Chakram.spec 2>/dev/null || true

# --onedir + --windowed produces a proper macOS .app bundle (Chakram.app)
python3 -m PyInstaller \
  --onedir \
  --windowed \
  --name "Chakram" \
  --add-binary "chakram:." \
  --hidden-import customtkinter \
  --hidden-import PIL \
  --hidden-import PIL._tkinter_finder \
  chakram_gui.py

echo ""
echo "✓ Done: dist/Chakram.app"
echo "  Run with:      open dist/Chakram.app"
echo "  To distribute: zip -r Chakram-mac.zip dist/Chakram.app"
ls -lh dist/
