# Get DLC Info from SteamDB

> Fork maintained by **gmy77** — actively updated.

## 🚀 NEW: Desktop Tool Available!

### 🎁 **Steam DLC Pro** — Single EXE, No Installation Required

**Windows users:** Just download and run!
- ⚡ **One-click EXE** — no Python installation needed
- 🎨 **Beautiful dark-mode GUI** (customtkinter)
- 🔍 **Auto-scans** your Steam library on launch
- 📦 **Auto-installs** configs directly into game folders
- 🔒 **Protected** with anti-debug, integrity checks, HWID binding

👉 **[Windows Build Guide](WINDOWS_GUIDE.md)** — How to create `SteamDLCPro.exe` on your PC

### 🐍 Python Desktop Tool (cross-platform)

For Linux/macOS or if you prefer running Python scripts:
- **Automatically scans** your entire Steam library
- **Batch processes** all games to fetch DLC info
- **Generates configs** for CreamAPI, Goldberg, CreamLinux
- Includes both **GUI and CLI interfaces**

👉 **[Python Tool Documentation](README_DESKTOP.md)**

---

## Browser Userscript

The original browser extension is still available and maintained.

### Installation

1. Install a userscript manager:
   - **[Tampermonkey](https://tampermonkey.net)** _(CLOSED SOURCE)_
   - **[Violentmonkey](https://violentmonkey.github.io)** _(OPEN SOURCE)_

2. Install **[Get DLC Info from SteamDB](dist/sak32009-get-data-from-steam-steamdb.user.js?raw=true)** userscript.

3. Visit [store.steampowered.com](https://store.steampowered.com/app/218620) or [steamdb.info](https://steamdb.info/app/218620)
   and look for the floating toolkit in the bottom-right corner.

---

## Features

### Data collection
- **DLC list** — merged from Steam Store API + SteamDB DOM scraper (best of both sources)
- **Achievements** — name, display name, description, icons
- **Depots** — ID, name, manifests, OS list
- **Packages / Prices** — parsed from Steam Store API with discount info
- **Game overview** — type, release date, price, developers, publishers, platforms

### Multi-emulator export
| Format | File | Emulator |
|--------|------|----------|
| `cream_api.ini` | `APPID_cream_api.ini` | CreamAPI (v4.x) |
| `DLC.txt` | `APPID_DLC.txt` | **Goldberg Steam Emulator** (`steam_settings/DLC.txt`) |
| `creamlinux.ini` | `APPID_creamlinux.ini` | CreamLinux / Smoke |
| `achievements.ini` | `APPID_achievements.ini` | Achievement Watcher |
| `achievements.json` | `APPID_achievements.json` | JSON |
| `depots.csv` | `APPID_depots.csv` | Spreadsheet |
| **Export Bundle** | `APPID_export_bundle.txt` | All formats in one file |

### UI / UX
- **Filter / search** in DLC and achievement lists (live, debounced)
- **DLC + Achievement count badges** in the panel header
- **Draggable panel** — click & drag the header to reposition; position is saved in sessionStorage
- **Keyboard shortcut** `Alt+Shift+S` — toggle panel visibility from anywhere on the page
- **Packages section** — shows available packages with prices and discounts from Steam API
- One-click **Copy IDs**, **Copy JSON**, **Copy Store JSON**
- **Refresh** button to force-reload from Steam API (bypasses cache)
- Dark translucent UI with backdrop blur, compatible with Steam and SteamDB themes
- Session-persistent visibility preference

---

## Updating

The script updates automatically through your userscript manager.
Alternatively, click the installation link again to get the latest version.

## License

**Get DLC Info from SteamDB** is released under [MIT](LICENSE).
Based on the original work by [Sak32009](https://github.com/Sak32009/GetDataFromSteam-SteamDB).
