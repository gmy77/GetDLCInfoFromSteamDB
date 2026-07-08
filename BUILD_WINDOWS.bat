@echo off
REM ════════════════════════════════════════════════════════════════════════
REM  STEAM DLC PRO — BUILD SCRIPT PER WINDOWS
REM  Questo script scarica il codice, installa dipendenze e crea l'EXE
REM ════════════════════════════════════════════════════════════════════════

echo.
echo ╔══════════════════════════════════════════╗
echo ║   Steam DLC Pro - Builder Windows       ║
echo ╚══════════════════════════════════════════╝
echo.

REM Controlla se Python è installato
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python non trovato!
    echo    Installa Python 3.10+ da: https://www.python.org/downloads/
    echo    Assicurati di spuntare "Add Python to PATH" durante l'installazione
    pause
    exit /b 1
)

echo [1/5] Controllo Python...
python --version
echo.

echo [2/5] Installazione dipendenze di build...
python -m pip install --upgrade pip setuptools wheel
python -m pip install pyinstaller customtkinter requests vdf Pillow
echo.

echo [3/5] Protezione tramite protect.py (anti-debug + HWID integrati)...
echo       PyArmor trial disabilitato: blocca l'esecuzione su script grandi.
echo.

echo [4/5] Compilazione in corso...
echo       Questo può richiedere 2-5 minuti...
echo.
python build_exe.py
if errorlevel 1 (
    echo.
    echo ❌ Build fallito! Vedi errori sopra.
    pause
    exit /b 1
)

echo.
echo [5/5] Build completato!
echo.
echo ╔══════════════════════════════════════════╗
echo ║  ✓ EXE creato con successo!              ║
echo ╚══════════════════════════════════════════╝
echo.
echo Troverai l'EXE in: dist\SteamDLCPro.exe
echo.
echo Puoi copiarlo ovunque e usarlo senza installazione.
echo.

REM Apri la cartella dist se esiste
if exist dist\ (
    echo Apertura cartella dist...
    explorer dist
)

pause
