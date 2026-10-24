# Build Guide — SteamDLCPro EXE

## Quick build

```bash
# Install build deps
pip install pyinstaller customtkinter requests vdf Pillow

# Optional: obfuscation (stronger code protection)
pip install pyarmor

# Build
python build_exe.py
```

Output: `dist/SteamDLCPro.exe` (Windows) or `dist/SteamDLCPro` (Linux/macOS)

## Protection layers applied

| Layer | Technique | What it does |
|-------|-----------|--------------|
| 1 | XOR string pool | Steam API URL and key strings never appear plaintext |
| 2 | PyArmor obfuscation | Bytecode replaced with encrypted runtime (if installed) |
| 3 | Anti-debug (Windows) | `IsDebuggerPresent` + `CheckRemoteDebuggerPresent` |
| 4 | Anti-debug (cross-platform) | `sys.gettrace()` + timing heuristic |
| 5 | EXE integrity hash | SHA-256 of the binary stored at first run; verified on every launch |
| 6 | HWID binding (optional) | Baseline hash includes machine GUID — copy won't pass on different PC |
| 7 | No console window | `--noconsole` on Windows; UI-only surface |

> **Note:** No protection is 100% unbreakable. These layers significantly
> raise the bar for casual crackers and automated rippers.

## Adding an icon

Place `assets/icon.ico` (Windows) or `assets/icon.png` (Linux/Mac)
before running the build. The script picks it up automatically.

## One-dir build (faster startup)

```bash
python build_exe.py --onedir
```

Produces a folder `dist/SteamDLCPro/` instead of a single file.
Startup is ~3× faster; distribute the whole folder as a ZIP.

## Re-signing (optional, Windows only)

If you have a code-signing certificate:

```powershell
signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 `
              /f MyCert.pfx /p MyPassword dist\SteamDLCPro.exe
```
