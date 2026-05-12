#!/usr/bin/env python3
"""
Steam DLC Manager - Unified Tool
Scans Steam games, fetches DLC info from SteamDB, generates CreamAPI/Goldberg configs
"""

import os
import sys
import json
import re
import requests
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import vdf  # pip install vdf


class SteamLibraryScanner:
    """Scans Steam installation and finds all installed games"""

    def __init__(self):
        self.steam_path = self._find_steam_path()
        self.library_folders = []
        self.installed_games = {}

    def _find_steam_path(self) -> Optional[Path]:
        """Find Steam installation path based on OS"""
        if sys.platform == "win32":
            possible_paths = [
                Path("C:/Program Files (x86)/Steam"),
                Path("C:/Program Files/Steam"),
                Path(os.path.expandvars("%ProgramFiles(x86)%/Steam")),
            ]
        elif sys.platform == "darwin":
            possible_paths = [
                Path.home() / "Library/Application Support/Steam",
            ]
        else:  # Linux
            possible_paths = [
                Path.home() / ".steam/steam",
                Path.home() / ".local/share/Steam",
            ]

        for path in possible_paths:
            if path.exists() and (path / "steamapps").exists():
                return path

        return None

    def scan_library(self) -> Dict[str, Dict]:
        """Scan Steam library and return all installed games"""
        if not self.steam_path:
            raise Exception("Steam installation not found")

        # Read libraryfolders.vdf
        library_vdf = self.steam_path / "steamapps" / "libraryfolders.vdf"
        if not library_vdf.exists():
            # Fallback to config/libraryfolders.vdf
            library_vdf = self.steam_path / "config" / "libraryfolders.vdf"

        if not library_vdf.exists():
            raise Exception(f"libraryfolders.vdf not found in {self.steam_path}")

        # Parse VDF
        with open(library_vdf, 'r', encoding='utf-8') as f:
            library_data = vdf.load(f)

        # Extract library folders
        folders = []
        if 'libraryfolders' in library_data:
            for key, folder_data in library_data['libraryfolders'].items():
                if isinstance(folder_data, dict) and 'path' in folder_data:
                    folders.append(Path(folder_data['path']))

        # Add main Steam folder
        if self.steam_path not in folders:
            folders.insert(0, self.steam_path)

        self.library_folders = folders

        # Scan each library folder for installed games
        games = {}
        for folder in folders:
            steamapps = folder / "steamapps"
            if not steamapps.exists():
                continue

            # Read all .acf files (app manifests)
            for acf_file in steamapps.glob("appmanifest_*.acf"):
                try:
                    with open(acf_file, 'r', encoding='utf-8') as f:
                        app_data = vdf.load(f)

                    if 'AppState' in app_data:
                        app_state = app_data['AppState']
                        app_id = app_state.get('appid', '')
                        name = app_state.get('name', f'Unknown Game {app_id}')
                        install_dir = app_state.get('installdir', '')

                        games[app_id] = {
                            'appid': app_id,
                            'name': name,
                            'install_dir': install_dir,
                            'install_path': steamapps / "common" / install_dir,
                            'library_path': folder,
                        }
                except Exception as e:
                    print(f"Error reading {acf_file}: {e}")

        self.installed_games = games
        return games


class SteamAPIClient:
    """Fetches DLC information from Steam Store API"""

    API_URL = "https://store.steampowered.com/api/appdetails"

    def __init__(self):
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'SteamDLCManager/1.0'
        })

    def get_game_details(self, app_id: str) -> Optional[Dict]:
        """Fetch game details including DLC list from Steam API"""
        try:
            params = {
                'appids': app_id,
                'cc': 'us',
                'l': 'english',
                'filters': 'basic,dlc'
            }

            response = self.session.get(self.API_URL, params=params, timeout=10)
            response.raise_for_status()

            data = response.json()
            if data.get(app_id, {}).get('success'):
                return data[app_id]['data']

            return None

        except Exception as e:
            print(f"Error fetching data for {app_id}: {e}")
            return None

    def get_dlc_list(self, app_id: str) -> List[Dict[str, str]]:
        """Get list of DLC for a game"""
        details = self.get_game_details(app_id)
        if not details:
            return []

        dlc_ids = details.get('dlc', [])
        dlc_list = []

        for dlc_id in dlc_ids:
            # Fetch name for each DLC
            dlc_details = self.get_game_details(str(dlc_id))
            if dlc_details:
                dlc_list.append({
                    'id': str(dlc_id),
                    'name': dlc_details.get('name', f'DLC {dlc_id}')
                })
            else:
                dlc_list.append({
                    'id': str(dlc_id),
                    'name': f'DLC {dlc_id}'
                })

        return dlc_list


class ConfigGenerator:
    """Generates configuration files for CreamAPI, Goldberg, etc."""

    @staticmethod
    def generate_cream_api(app_id: str, dlc_list: List[Dict[str, str]]) -> str:
        """Generate cream_api.ini content"""
        lines = [
            "; cream_api.ini - Generated by Steam DLC Manager",
            "; https://github.com/gmy77/GetDLCInfoFromSteamDB",
            "",
            "[steam]",
            f"appid = {app_id}",
            "",
            "[dlc]",
        ]

        for dlc in dlc_list:
            lines.append(f"{dlc['id']} = {dlc['name']}")

        return "\n".join(lines)

    @staticmethod
    def generate_goldberg(app_id: str, dlc_list: List[Dict[str, str]]) -> str:
        """Generate Goldberg Emulator DLC.txt content"""
        lines = [
            "; Goldberg Steam Emulator - DLC.txt",
            f"; AppID: {app_id}",
            "; Place at: steam_settings/DLC.txt",
            "; https://github.com/gmy77/GetDLCInfoFromSteamDB",
            "",
        ]

        for dlc in dlc_list:
            lines.append(f"{dlc['id']}={dlc['name']}")

        return "\n".join(lines)

    @staticmethod
    def generate_cream_linux(app_id: str, dlc_list: List[Dict[str, str]]) -> str:
        """Generate creamlinux.ini content"""
        lines = [
            "[settings]",
            f"app_id={app_id}",
            "",
            "[dlc]",
        ]

        for dlc in dlc_list:
            lines.append(f"{dlc['id']}={dlc['name']}")

        return "\n".join(lines)

    @staticmethod
    def save_configs(app_id: str, game_name: str, dlc_list: List[Dict[str, str]],
                     output_dir: Path):
        """Save all configuration files"""
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

        # Sanitize game name for filename
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', game_name)

        configs = {
            f"{app_id}_{safe_name}_cream_api.ini": ConfigGenerator.generate_cream_api(app_id, dlc_list),
            f"{app_id}_{safe_name}_DLC.txt": ConfigGenerator.generate_goldberg(app_id, dlc_list),
            f"{app_id}_{safe_name}_creamlinux.ini": ConfigGenerator.generate_cream_linux(app_id, dlc_list),
        }

        saved_files = []
        for filename, content in configs.items():
            filepath = output_dir / filename
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            saved_files.append(filepath)

        return saved_files


class SteamDLCManager:
    """Main application class"""

    def __init__(self):
        self.scanner = SteamLibraryScanner()
        self.api_client = SteamAPIClient()
        self.games = {}

    def scan_games(self):
        """Scan installed Steam games"""
        print("Scanning Steam library...")
        self.games = self.scanner.scan_library()
        print(f"Found {len(self.games)} installed games")
        return self.games

    def list_games(self):
        """Print list of installed games"""
        if not self.games:
            self.scan_games()

        print("\n=== Installed Steam Games ===")
        for idx, (app_id, game) in enumerate(sorted(self.games.items(), key=lambda x: x[1]['name']), 1):
            print(f"{idx:4d}. [{app_id:7s}] {game['name']}")

    def process_game(self, app_id: str, output_dir: str = "./output") -> bool:
        """Process a single game: fetch DLC and generate configs"""
        if app_id not in self.games:
            print(f"Game {app_id} not found in library")
            return False

        game = self.games[app_id]
        print(f"\nProcessing: {game['name']} (AppID: {app_id})")

        # Fetch DLC list
        print("Fetching DLC information from Steam API...")
        dlc_list = self.api_client.get_dlc_list(app_id)

        if not dlc_list:
            print("No DLC found for this game")
            return False

        print(f"Found {len(dlc_list)} DLC items")

        # Generate configs
        print(f"Generating configuration files...")
        saved_files = ConfigGenerator.save_configs(
            app_id, game['name'], dlc_list, Path(output_dir)
        )

        print(f"✓ Saved {len(saved_files)} configuration files:")
        for file in saved_files:
            print(f"  - {file}")

        return True

    def process_all_games(self, output_dir: str = "./output"):
        """Process all installed games"""
        if not self.games:
            self.scan_games()

        print(f"\nProcessing {len(self.games)} games...")

        success_count = 0
        for app_id in self.games:
            if self.process_game(app_id, output_dir):
                success_count += 1

        print(f"\n=== Complete ===")
        print(f"Successfully processed {success_count}/{len(self.games)} games")


def main():
    """Main entry point"""
    print("╔═══════════════════════════════════════════╗")
    print("║   Steam DLC Manager v1.0                 ║")
    print("║   Unified GetDLCInfoFromSteamDB Tool     ║")
    print("╚═══════════════════════════════════════════╝")
    print()

    try:
        manager = SteamDLCManager()
        manager.scan_games()
        manager.list_games()

        print("\n" + "="*50)
        print("Options:")
        print("  1. Process specific game (by AppID)")
        print("  2. Process all games")
        print("  3. Exit")
        print("="*50)

        choice = input("\nEnter choice (1-3): ").strip()

        if choice == "1":
            app_id = input("Enter AppID: ").strip()
            output_dir = input("Output directory (default: ./output): ").strip() or "./output"
            manager.process_game(app_id, output_dir)

        elif choice == "2":
            output_dir = input("Output directory (default: ./output): ").strip() or "./output"
            confirm = input(f"Process all {len(manager.games)} games? (y/n): ").strip().lower()
            if confirm == 'y':
                manager.process_all_games(output_dir)

        elif choice == "3":
            print("Goodbye!")
            return

        else:
            print("Invalid choice")

    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()
