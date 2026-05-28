@echo off
echo Building Chakram.exe for Windows...

pip install pyinstaller customtkinter requests pillow

if exist "Chakram.spec" del /f "Chakram.spec"
if exist "dist" rmdir /s /q dist
if exist "build" rmdir /s /q build

copy ..\chakram-windows.exe chakram.exe

pyinstaller --onefile --windowed --name "Chakram" ^
  --add-binary "chakram.exe;." ^
  --hidden-import customtkinter ^
  --hidden-import PIL ^
  --hidden-import PIL._tkinter_finder ^
  chakram_gui.py

echo.
echo Done: dist\Chakram.exe
dir dist\Chakram.exe
