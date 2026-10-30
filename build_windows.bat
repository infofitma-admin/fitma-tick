@echo off
REM Build Fitma Tick for Windows. Run on a Windows PC with Python 3.10+ installed.
REM 1) First edit fitma_tick.py and set DEFAULT_EXEC_URL to your Workspace /exec link.
python -m pip install --upgrade pip
python -m pip install -r requirements.txt pyinstaller
pyinstaller --noconfirm --windowed --onefile --name "Fitma Tick" fitma_tick.py
echo.
echo Done. The app is in the "dist" folder: "dist\Fitma Tick.exe"
echo Upload that file to Google Drive (share: anyone with the link) and paste the link
echo into the workspace: Settings - Fitma Tick download links - Windows.
pause
