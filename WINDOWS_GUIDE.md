# 🎮 Steam DLC Pro — Guida Completa Windows

## 📍 Dove trovi l'EXE

Dopo il build, l'EXE sarà in:
```
C:\Utenti\Gimmy\GetDLCInfoFromSteamDB\dist\SteamDLCPro.exe
```

## 🚀 Come creare l'EXE (passo per passo)

### Metodo 1: Script Automatico ⭐ CONSIGLIATO

1. **Scarica il repository** sul tuo PC Windows:
   ```cmd
   cd C:\Utenti\Gimmy
   git clone https://github.com/gmy77/GetDLCInfoFromSteamDB.git
   cd GetDLCInfoFromSteamDB
   ```

2. **Doppio click su** `BUILD_WINDOWS.bat`
   - Installa automaticamente tutte le dipendenze
   - Compila l'EXE
   - Apre la cartella `dist\` al termine

3. **Trovi l'EXE in** `dist\SteamDLCPro.exe` ✅

### Metodo 2: Manuale

1. **Installa Python 3.10+** (se non già installato):
   - https://www.python.org/downloads/
   - ✅ Spunta "Add Python to PATH"

2. **Apri PowerShell/CMD** nella cartella del progetto:
   ```cmd
   cd C:\Utenti\Gimmy\GetDLCInfoFromSteamDB
   ```

3. **Installa dipendenze**:
   ```cmd
   pip install pyinstaller customtkinter requests vdf Pillow
   
   # Opzionale: protezione avanzata
   pip install pyarmor
   ```

4. **Build**:
   ```cmd
   python build_exe.py
   ```

5. **Output**:
   ```
   dist\SteamDLCPro.exe    ← Il tuo EXE pronto!
   dist\SteamDLCPro.exe.sha256
   ```

## 📦 Distribuzione

L'EXE è **totalmente standalone**:
- ✅ Puoi copiarlo ovunque (desktop, chiavetta USB, ecc.)
- ✅ Non serve installazione
- ✅ Funziona su qualsiasi PC Windows 10/11
- ✅ Nessuna dipendenza esterna

### Protezioni incluse nell'EXE:

| Layer | Protezione |
|-------|------------|
| 🔒 | Stringhe API cifrate XOR (non appaiono in chiaro) |
| 🔒 | Anti-debug Windows (IsDebuggerPresent) |
| 🔒 | Anti-debug timing check |
| 🔒 | Hash integrità EXE (rilevare modifiche) |
| 🔒 | HWID binding (legato al PC) |
| 🔐 | PyArmor bytecode encryption (se installato) |

## 🎨 Aspetto dell'app

- **Dark theme** moderno (customtkinter)
- **Auto-scan** libreria Steam all'avvio
- **Lista giochi** con checkbox e ricerca
- **Progress bar** + log in tempo reale
- **Auto-install** configs direttamente nelle cartelle giochi

## 🔧 Risoluzione problemi

### "Python non trovato"
Installa Python da https://www.python.org/ e riavvia il terminale

### "ModuleNotFoundError: No module named 'customtkinter'"
```cmd
pip install customtkinter requests vdf Pillow
```

### "PyInstaller failed"
Prova con permessi amministratore:
```cmd
# Clicca destro su CMD → "Esegui come amministratore"
python build_exe.py
```

### Build troppo lento?
Usa `--onedir` per build più veloce:
```cmd
python build_exe.py --onedir
```
Output sarà una cartella `dist\SteamDLCPro\` invece di un singolo file.

## 📞 Supporto

Se hai problemi, apri un issue su:
https://github.com/gmy77/GetDLCInfoFromSteamDB/issues
