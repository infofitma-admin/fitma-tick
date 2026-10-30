#!/bin/bash
# Build Fitma Tick for macOS. Run on a Mac with Python 3.10+ installed.
# 1) First edit fitma_tick.py and set DEFAULT_EXEC_URL to your Workspace /exec link.
set -e
python3 -m pip install --upgrade pip
python3 -m pip install -r requirements.txt pyinstaller
pyinstaller --noconfirm --windowed --onefile --name "Fitma Tick" fitma_tick.py
cd dist && zip -r "Fitma Tick (Mac).zip" "Fitma Tick.app" >/dev/null && cd ..
echo ""
echo "Done. Share dist/\"Fitma Tick (Mac).zip\" with the team (upload to Drive,"
echo "share anyone-with-the-link) and paste the link into the workspace:"
echo "Settings - Fitma Tick download links - Mac."
