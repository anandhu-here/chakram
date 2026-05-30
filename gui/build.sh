#!/bin/bash
# Builds the Chakram GUI as a standalone macOS executable

set -e

pip3 install pyinstaller customtkinter requests pillow

# Copy chakram binary into gui folder
cp ../chakram-mac ./chakram

# Build with PyInstaller
pyinstaller --onefile \
  --windowed \
  --name "Chakram" \
  chakram_gui.py

echo "Built: dist/Chakram"
