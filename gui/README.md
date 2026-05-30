# Chakram GUI

Desktop wallet and node manager for the Chakram (CHK) cryptocurrency.

Built with Python + CustomTkinter. Bundles the Chakram node binary so no separate installation is needed.

## Running from source

```bash
pip3 install customtkinter requests pillow
python3 chakram_gui.py
```

The `chakram-mac` (or `chakram`) binary must be in the same folder as `chakram_gui.py`, or one directory up, or in `~/Downloads`. Download it from the [releases page](https://github.com/anandhu-here/chakram/releases).

## Building a standalone Mac app

Produces a single self-contained binary at `dist/Chakram`.

```bash
cd gui/
bash build_mac.sh
```

Requires macOS with Python 3.9+. PyInstaller and all dependencies are installed automatically.

To distribute: copy `dist/Chakram` to any Mac. No Python installation needed on the target machine.

## Building a standalone Windows exe

Must be run **on a Windows machine** — PyInstaller cannot cross-compile Windows binaries from Mac or Linux.

```bat
cd gui\
build_windows.bat
```

Requires Windows with Python 3.9+ installed. Produces `dist\Chakram.exe`.

## Features

- Automatic node startup — launches the Chakram node on first run
- Real-time balance display with live polling
- Mining toggle — start/stop mining with one click
- Send CHK — send to any CK1 address
- Receive — display your address in large text with one-click copy
- Transaction history — received UTXOs sorted by block height
- Recent blocks — last 12 blocks with miner highlighting; click any row to open in the block explorer
- Sync progress bar — shows sync percentage during initial block download
- Settings panel — shows data directory, network, protocol version, chain height
- Tooltips on all interactive elements

## Notes on "sent" transactions

The GUI shows **received** UTXOs from `/utxos/{address}`. Sent transactions are not indexed by the node's RPC API. For full transaction history including sends, open the block explorer (click "Block Explorer →" in the status bar).
