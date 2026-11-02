#!/bin/bash
# Steam DLC Manager - Linux/macOS Launcher
# Automatically installs dependencies and runs the GUI

echo "========================================="
echo " Steam DLC Manager - GUI Launcher"
echo "========================================="
echo ""

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.7+ using your package manager"
    echo ""
    exit 1
fi

echo "[1/2] Installing dependencies..."
python3 -m pip install -r requirements.txt --quiet --disable-pip-version-check

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Failed to install dependencies"
    echo "Try running: pip3 install -r requirements.txt"
    echo ""
    exit 1
fi

echo "[2/2] Launching Steam DLC Manager GUI..."
echo ""

python3 steam_dlc_gui.py

if [ $? -ne 0 ]; then
    echo ""
    echo "ERROR: Failed to launch GUI"
    echo ""
    exit 1
fi
