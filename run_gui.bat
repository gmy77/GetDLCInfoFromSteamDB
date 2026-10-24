@echo off
REM Steam DLC Manager - Windows Launcher
REM Automatically installs dependencies and runs the GUI

echo =========================================
echo  Steam DLC Manager - GUI Launcher
echo =========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.7+ from https://www.python.org/
    echo.
    pause
    exit /b 1
)

echo [1/2] Installing dependencies...
python -m pip install -r requirements.txt --quiet --disable-pip-version-check

if errorlevel 1 (
    echo.
    echo ERROR: Failed to install dependencies
    echo Try running: pip install -r requirements.txt
    echo.
    pause
    exit /b 1
)

echo [2/2] Launching Steam DLC Manager GUI...
echo.

python steam_dlc_gui.py

if errorlevel 1 (
    echo.
    echo ERROR: Failed to launch GUI
    echo.
    pause
    exit /b 1
)
