# Steam DLC Manager - Desktop Tool

> **Unified Tool**: Combines GetDLCInfoFromSteamDB with automatic Steam library scanning and config generation

## 🎯 What This Does

A Python desktop application that:

1. **Automatically scans** your Steam library and finds all installed games
2. **Fetches DLC information** from Steam API for each game
3. **Generates configuration files** for CreamAPI, Goldberg Emulator, and CreamLinux
4. **Batch processing** - handle multiple games at once
5. **GUI and CLI interfaces** - use whichever you prefer

## 🚀 Quick Start

### Prerequisites

- Python 3.7+ installed
- Steam installed on your system

### Installation

1. Clone or download this repository:
```bash
git clone https://github.com/gmy77/GetDLCInfoFromSteamDB.git
cd GetDLCInfoFromSteamDB
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

### Usage

#### GUI Mode (Recommended)

Run the GUI application:
```bash
python steam_dlc_gui.py
```

**Features:**
- Visual game selection with search/filter
- Progress tracking
- Detailed logging
- Select specific games or process all at once
- Custom output directory

#### CLI Mode

Run the command-line version:
```bash
python steam_dlc_manager.py
```

**Interactive menu:**
1. Scan Steam library
2. List all games
3. Process specific game by AppID
4. Process all games
5. Custom output directory

## 📁 Output Files

For each game with DLC, the tool generates:

| File | Format | Usage |
|------|--------|-------|
| `APPID_GameName_cream_api.ini` | CreamAPI v4.x config | Place in game directory with `cream_api.dll` |
| `APPID_GameName_DLC.txt` | Goldberg format | Place in `steam_settings/DLC.txt` |
| `APPID_GameName_creamlinux.ini` | CreamLinux config | Use with CreamLinux/Smoke |

### Example Output

```
output/
├── 292030_TheWitcher3_cream_api.ini
├── 292030_TheWitcher3_DLC.txt
├── 292030_TheWitcher3_creamlinux.ini
├── 218620_PayDay2_cream_api.ini
├── 218620_PayDay2_DLC.txt
└── 218620_PayDay2_creamlinux.ini
```

## 🔧 How It Works

### Steam Library Detection

The tool automatically finds your Steam installation:

- **Windows**: `C:\Program Files (x86)\Steam`
- **Linux**: `~/.steam/steam` or `~/.local/share/Steam`
- **macOS**: `~/Library/Application Support/Steam`

### Library Scanning

1. Reads `libraryfolders.vdf` to find all Steam library locations
2. Scans `appmanifest_*.acf` files in each library
3. Extracts AppID, game name, and install path for each game

### DLC Fetching

- Uses official Steam Store API (`https://store.steampowered.com/api/appdetails`)
- Retrieves complete DLC list with names
- Caches results in memory for faster processing

### Config Generation

Generates configs in the correct format for each emulator:

**CreamAPI (`cream_api.ini`):**
```ini
[steam]
appid = 292030

[dlc]
378648 = The Witcher 3: Wild Hunt - Temerian Armor Set
378649 = The Witcher 3: Wild Hunt - Beard and Hairstyle Set
```

**Goldberg (`DLC.txt`):**
```
378648=The Witcher 3: Wild Hunt - Temerian Armor Set
378649=The Witcher 3: Wild Hunt - Beard and Hairstyle Set
```

**CreamLinux (`creamlinux.ini`):**
```ini
[settings]
app_id=292030

[dlc]
378648=The Witcher 3: Wild Hunt - Temerian Armor Set
378649=The Witcher 3: Wild Hunt - Beard and Hairstyle Set
```

## 🎨 GUI Screenshots

### Main Window
- Game list with search/filter
- Multi-selection support
- Real-time status updates
- Process log

### Features
- **Search**: Filter games by name or AppID
- **Batch Selection**: Select multiple games, or all games at once
- **Progress Tracking**: See what's happening in real-time
- **Custom Output**: Choose where to save config files

## 🛠️ Advanced Usage

### Command-Line Arguments (for scripting)

You can also import and use the modules in your own scripts:

```python
from steam_dlc_manager import SteamDLCManager

manager = SteamDLCManager()
games = manager.scan_games()

# Process specific game
manager.process_game("292030", output_dir="./my_configs")

# Process all games
manager.process_all_games(output_dir="./all_configs")
```

### Custom Steam Path

If your Steam installation isn't detected automatically:

```python
from steam_dlc_manager import SteamLibraryScanner

scanner = SteamLibraryScanner()
scanner.steam_path = Path("/custom/steam/path")
games = scanner.scan_library()
```

## 🔐 Requirements

### Python Packages

- `requests` - HTTP requests to Steam API
- `vdf` - Parse Valve Data Format files (`.vdf`, `.acf`)

Install with:
```bash
pip install -r requirements.txt
```

### System Requirements

- Python 3.7 or higher
- Steam installed
- Internet connection (for fetching DLC data)

## 🐛 Troubleshooting

### "Steam installation not found"

- Make sure Steam is installed
- Try manually specifying Steam path in code
- Check that `steamapps` folder exists

### "No DLC found"

- Game might not have any DLC
- Steam API might be temporarily unavailable
- Check game's Steam store page to verify DLC exists

### "Error reading ACF file"

- File might be corrupted
- Game might be partially installed
- Skip the problematic game and continue

## 🤝 Integration with CreamAPI

### Using Generated Configs

1. Download CreamAPI from the [official source](https://cs.rin.ru/forum/viewtopic.php?f=29&t=70576)
2. Extract `cream_api.dll` to the game directory
3. Copy the generated `APPID_GameName_cream_api.ini` to the game directory
4. Rename it to `cream_api.ini`
5. Launch the game

### Using with Goldberg

1. Download Goldberg Steam Emulator
2. Replace `steam_api.dll` / `steam_api64.dll` with Goldberg versions
3. Create `steam_settings` folder in game directory
4. Copy generated `APPID_GameName_DLC.txt` to `steam_settings/DLC.txt`
5. Launch the game

## 📜 Browser Extension Still Available

The original userscript for browser use is still available:

- **Installation**: [Get userscript](dist/sak32009-get-data-from-steam-steamdb.user.js)
- **Usage**: Works on Steam Store and SteamDB pages
- **Features**: Manual DLC lookup with live panel

Both tools complement each other:
- **Desktop tool**: Batch process your entire library
- **Browser tool**: Quick lookup while browsing Steam/SteamDB

## 📖 Related Projects

- **CreamAPI** - DLC unlocker for Steam games
- **Goldberg Steam Emulator** - Steam emulator for DRM-free play
- **CreamLinux** - Linux port of CreamAPI
- **SteamDB** - Community database for Steam games

## 🙏 Credits

- Original GetDLCInfoFromSteamDB userscript by [Sak32009](https://github.com/Sak32009/GetDataFromSteam-SteamDB)
- Desktop tool and integration by [gmy77](https://github.com/gmy77)
- Steam API provided by Valve Corporation
- SteamDB community

## 📄 License

**MIT License** - See [LICENSE](LICENSE) file

## ⚠️ Disclaimer

This tool is for educational and backup purposes only. Use it to manage DLC for games you legally own. The authors are not responsible for misuse.

---

**Questions or issues?** Open an issue on [GitHub](https://github.com/gmy77/GetDLCInfoFromSteamDB/issues)

**Want to contribute?** Pull requests are welcome!
