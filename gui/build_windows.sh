#!/bin/bash
# NOTE: This script does NOT work on Mac/Linux — PyInstaller cannot cross-compile
# Windows .exe files from a non-Windows host.
#
# To build the Windows GUI:
#   1. Copy gui/ and chakram-windows.exe to a Windows machine
#   2. Run: build_windows.bat
#
# For CI/CD automation, use a Windows GitHub Actions runner or a Windows VM.
echo "Windows GUI must be built on Windows — see README.md"
exit 1
