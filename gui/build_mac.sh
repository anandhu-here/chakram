#!/bin/bash
set -e
echo "Building Chakram GUI for Mac..."
pip3 install pyinstaller customtkinter requests pillow

# Copy chakram binary into gui folder
cp ../chakram-mac ./chakram

# Bundle everything into one app
pyinstaller \
  --onefile \
  --windowed \
  --name "Chakram" \
  --add-binary "chakram:." \
  chakram_gui.py

echo "Done! Find your app at: dist/Chakram"
echo "Double-click dist/Chakram to run"
