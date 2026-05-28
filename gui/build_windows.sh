#!/bin/bash
set -e
echo "Building Chakram GUI for Windows..."
pip install pyinstaller customtkinter requests pillow

cp ../chakram-windows.exe ./chakram.exe

pyinstaller \
  --onefile \
  --windowed \
  --name "Chakram" \
  --add-binary "chakram.exe:." \
  chakram_gui.py

echo "Done! Find your app at: dist/Chakram.exe"
