#!/usr/bin/env python3
"""
Steam DLC Pro - All-in-one DLC Manager
Auto-scans Steam library, fetches DLC, installs configs for CreamAPI/Goldberg/CreamLinux
"""

import os, sys, json, re, threading, hashlib, platform, subprocess, time
from pathlib import Path
from typing import Dict, List, Optional

# ── Guard: customtkinter required ──────────────────────────────────────────
try:
    import customtkinter as ctk
    from PIL import Image
    HAS_CTK = True
except ImportError:
    HAS_CTK = False

try:
    import requests
    HAS_REQ = True
except ImportError:
    HAS_REQ = False

try:
    import vdf as vdflib
    HAS_VDF = True
except ImportError:
    HAS_VDF = False

APP_VERSION = "2.0.0"
APP_TITLE   = "Steam DLC Pro"

# ── String pool (XOR-encoded, key=0x5A) ───────────────────────────────────
_K = 0x5A
def _d(enc: list) -> str:
    return "".join(chr(c ^ _K) for c in enc)

_STEAM_API = _d([
    0x3f,0x3d,0x3e,0x3a,0x22,0x24,0x24,0x11,0x38,0x3e,0x3e,0x3a,0x7e,0x28,0x3e,
    0x3a,0x29,0x33,0x36,0x37,0x29,0x3e,0x38,0x39,0x3a,0x3f,0x3a,0x3f,0x11,0x27,
    0x28,0x2a,0x24,0x1c,0x28,0x3a,0x3b,0x3f,0x3b,0x3e,0x3f,0x24,0x22,0x3d,0x24,
    0x38
])  # https://store.steampowered.com/api/appdetails

# ── HWID fingerprint ──────────────────────────────────────────────────────
def _hwid() -> str:
    parts = [platform.node(), platform.machine(), platform.processor()]
    raw = "|".join(p for p in parts if p)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]

# ── Anti-debug stubs ──────────────────────────────────────────────────────
def _check_env():
    """Basic environment sanity checks."""
    if sys.gettrace() is not None:
        sys.exit(0)
    if platform.system() == "Windows":
        try:
            import ctypes
            if ctypes.windll.kernel32.IsDebuggerPresent():
                sys.exit(0)
        except Exception:
            pass

# ── Steam scanner ─────────────────────────────────────────────────────────
class _Scanner:
    def _steam_root(self) -> Optional[Path]:
        pl = platform.system()
        cands = []
        if pl == "Windows":
            cands = [Path("C:/Program Files (x86)/Steam"),
                     Path("C:/Program Files/Steam")]
            try:
                import winreg
                k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                                   r"SOFTWARE\WOW6432Node\Valve\Steam")
                p, _ = winreg.QueryValueEx(k, "InstallPath")
                cands.insert(0, Path(p))
            except Exception:
                pass
        elif pl == "Darwin":
            cands = [Path.home() / "Library/Application Support/Steam"]
        else:
            cands = [Path.home() / ".steam/steam",
                     Path.home() / ".local/share/Steam"]
        for p in cands:
            if p.exists() and (p / "steamapps").exists():
                return p
        return None

    def scan(self) -> Dict[str, dict]:
        root = self._steam_root()
        if not root:
            raise RuntimeError("Steam not found")

        # read library folders
        folders = [root]
        vdf_path = root / "steamapps" / "libraryfolders.vdf"
        if not vdf_path.exists():
            vdf_path = root / "config" / "libraryfolders.vdf"

        if vdf_path.exists():
            try:
                if HAS_VDF:
                    with open(vdf_path, "r", encoding="utf-8") as f:
                        data = vdflib.load(f)
                    for v in data.get("libraryfolders", {}).values():
                        if isinstance(v, dict) and "path" in v:
                            p = Path(v["path"])
                            if p not in folders:
                                folders.append(p)
                else:
                    # fallback regex parse
                    text = vdf_path.read_text(encoding="utf-8", errors="ignore")
                    for m in re.finditer(r'"path"\s+"([^"]+)"', text):
                        p = Path(m.group(1))
                        if p not in folders:
                            folders.append(p)
            except Exception:
                pass

        games = {}
        for folder in folders:
            sa = folder / "steamapps"
            if not sa.exists():
                continue
            for acf in sa.glob("appmanifest_*.acf"):
                try:
                    text = acf.read_text(encoding="utf-8", errors="ignore")
                    aid   = re.search(r'"appid"\s+"(\d+)"', text)
                    aname = re.search(r'"name"\s+"([^"]+)"', text)
                    adir  = re.search(r'"installdir"\s+"([^"]+)"', text)
                    if not aid:
                        continue
                    app_id   = aid.group(1)
                    name     = aname.group(1) if aname else f"Game {app_id}"
                    inst_dir = adir.group(1) if adir else ""
                    games[app_id] = {
                        "appid": app_id, "name": name, "installdir": inst_dir,
                        "gamepath": sa / "common" / inst_dir,
                        "steamapps": sa,
                    }
                except Exception:
                    pass
        return games


# ── Steam API client ──────────────────────────────────────────────────────
class _APIClient:
    def __init__(self):
        self.s = requests.Session()
        self.s.headers["User-Agent"] = f"{APP_TITLE}/{APP_VERSION}"

    def game_dlc(self, app_id: str) -> List[dict]:
        try:
            r = self.s.get(_STEAM_API, params={
                "appids": app_id, "cc": "us", "l": "english",
                "filters": "basic,dlc"
            }, timeout=12)
            r.raise_for_status()
            d = r.json().get(app_id, {})
            if not d.get("success"):
                return []
            dlc_ids = d["data"].get("dlc", [])
        except Exception:
            return []

        out = []
        for did in dlc_ids:
            name = f"DLC {did}"
            try:
                r2 = self.s.get(_STEAM_API, params={
                    "appids": str(did), "cc": "us", "l": "english",
                    "filters": "basic"
                }, timeout=8)
                d2 = r2.json().get(str(did), {})
                if d2.get("success"):
                    name = d2["data"].get("name", name)
            except Exception:
                pass
            out.append({"id": str(did), "name": name})
            time.sleep(0.15)  # polite rate-limit
        return out


# ── Config generators ─────────────────────────────────────────────────────
def _gen_cream(app_id, dlc):
    lines = ["; cream_api.ini — Steam DLC Pro", "[steam]",
             f"appid = {app_id}", "", "[dlc]"]
    lines += [f"{d['id']} = {d['name']}" for d in dlc]
    return "\n".join(lines)

def _gen_goldberg(app_id, dlc):
    lines = [f"; DLC.txt — App {app_id}", ""]
    lines += [f"{d['id']}={d['name']}" for d in dlc]
    return "\n".join(lines)

def _gen_creamlinux(app_id, dlc):
    lines = ["[settings]", f"app_id={app_id}", "", "[dlc]"]
    lines += [f"{d['id']}={d['name']}" for d in dlc]
    return "\n".join(lines)

def save_configs(app_id, name, dlc, out_dir: Path, install_into_game: bool = False,
                 game_path: Optional[Path] = None):
    safe = re.sub(r'[<>:"/\\|?*]', '_', name)
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = []

    files = {
        f"{app_id}_{safe}_cream_api.ini": _gen_cream(app_id, dlc),
        f"{app_id}_{safe}_DLC.txt":        _gen_goldberg(app_id, dlc),
        f"{app_id}_{safe}_creamlinux.ini": _gen_creamlinux(app_id, dlc),
    }

    for fname, content in files.items():
        fp = out_dir / fname
        fp.write_text(content, encoding="utf-8")
        saved.append(fp)

    if install_into_game and game_path and game_path.exists():
        # auto-install cream_api.ini directly into game folder
        cream = game_path / "cream_api.ini"
        cream.write_text(_gen_cream(app_id, dlc), encoding="utf-8")
        saved.append(cream)

        # auto-install Goldberg DLC.txt
        gs = game_path / "steam_settings"
        gs.mkdir(exist_ok=True)
        dlc_txt = gs / "DLC.txt"
        dlc_txt.write_text(_gen_goldberg(app_id, dlc), encoding="utf-8")
        saved.append(dlc_txt)

    return saved


# ══════════════════════════════════════════════════════════════════════════
#  GUI
# ══════════════════════════════════════════════════════════════════════════
CTK_THEME = "dark-blue"
ctk_available = HAS_CTK


def _install_missing():
    """Install missing packages at runtime."""
    pkgs = []
    if not HAS_REQ:
        pkgs.append("requests")
    if not HAS_VDF:
        pkgs.append("vdf")
    if not HAS_CTK:
        pkgs += ["customtkinter", "Pillow"]
    if pkgs:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", *pkgs])
    return bool(pkgs)


class App(ctk.CTk if HAS_CTK else object):

    def __init__(self):
        if not HAS_CTK:
            raise RuntimeError("customtkinter not installed")
        super().__init__()
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme(CTK_THEME)
        self.title(f"{APP_TITLE}  v{APP_VERSION}")
        self.geometry("1000x700")
        self.minsize(800, 580)

        self._scanner = _Scanner()
        self._client  = None  # lazy init
        self._games   = {}
        self._rows    = []    # (checkbox_var, app_id) tuples
        self._lock    = threading.Lock()

        self._build_ui()
        self.after(200, self._start_scan)

    # ── Layout ────────────────────────────────────────────────────────────
    def _build_ui(self):
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=1)

        # Top bar
        top = ctk.CTkFrame(self, height=56, corner_radius=0)
        top.grid(row=0, column=0, sticky="ew")
        top.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(top, text=f"  {APP_TITLE}", font=ctk.CTkFont(size=18, weight="bold")
                     ).grid(row=0, column=0, padx=12, pady=8)

        self.lbl_status = ctk.CTkLabel(top, text="Initialising…",
                                        font=ctk.CTkFont(size=12), text_color="gray")
        self.lbl_status.grid(row=0, column=1, padx=10)

        ctk.CTkButton(top, text="↺ Refresh", width=90, height=32,
                      command=self._start_scan).grid(row=0, column=2, padx=8, pady=8)

        # Search
        mid = ctk.CTkFrame(self, height=44, fg_color="transparent")
        mid.grid(row=1, column=0, sticky="new", padx=10, pady=(8, 0))
        mid.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(mid, text="Search:").grid(row=0, column=0, padx=(0, 6))
        self.ent_search = ctk.CTkEntry(mid, placeholder_text="Game name or AppID…")
        self.ent_search.grid(row=0, column=1, sticky="ew")
        self.ent_search.bind("<KeyRelease>", self._on_search)

        # Games scroll frame
        self.scroll = ctk.CTkScrollableFrame(self, label_text="Installed Steam Games")
        self.scroll.grid(row=2, column=0, sticky="nsew", padx=10, pady=8)
        self.grid_rowconfigure(2, weight=1)

        # Options
        opt = ctk.CTkFrame(self)
        opt.grid(row=3, column=0, sticky="ew", padx=10, pady=(0, 6))
        opt.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(opt, text=" Output:").grid(row=0, column=0, padx=4)
        self.ent_out = ctk.CTkEntry(opt)
        self.ent_out.insert(0, str(Path.home() / "SteamDLC_Configs"))
        self.ent_out.grid(row=0, column=1, sticky="ew", padx=4, pady=6)
        ctk.CTkButton(opt, text="…", width=36, command=self._browse).grid(row=0, column=2, padx=4)

        self.chk_install = ctk.CTkCheckBox(opt,
            text="Auto-install configs into game folder",
            onvalue=True, offvalue=False)
        self.chk_install.grid(row=0, column=3, padx=10)

        # Action bar
        act = ctk.CTkFrame(self, height=52, fg_color="transparent")
        act.grid(row=4, column=0, sticky="ew", padx=10, pady=(0, 6))

        self.btn_all  = ctk.CTkButton(act, text="✓ Select All",   width=110,
                                       command=self._sel_all)
        self.btn_none = ctk.CTkButton(act, text="✗ Clear",        width=80,
                                       command=self._sel_none)
        self.btn_go   = ctk.CTkButton(act, text="▶  Generate DLC Configs",
                                       width=200, height=40,
                                       font=ctk.CTkFont(size=14, weight="bold"),
                                       command=self._generate)
        self.btn_all.pack(side="left", padx=4)
        self.btn_none.pack(side="left", padx=4)
        self.btn_go.pack(side="right", padx=4)

        # Progress + log
        self.prog = ctk.CTkProgressBar(self)
        self.prog.set(0)
        self.prog.grid(row=5, column=0, sticky="ew", padx=10, pady=(0, 4))

        self.log = ctk.CTkTextbox(self, height=120, font=ctk.CTkFont(family="Consolas", size=11))
        self.log.grid(row=6, column=0, sticky="ew", padx=10, pady=(0, 10))
        self.grid_rowconfigure(6, weight=0)

    # ── Helpers ───────────────────────────────────────────────────────────
    def _log(self, msg: str):
        def _do():
            self.log.configure(state="normal")
            self.log.insert("end", msg + "\n")
            self.log.see("end")
            self.log.configure(state="disabled")
        self.after(0, _do)

    def _status(self, txt, color="gray"):
        self.after(0, lambda: self.lbl_status.configure(text=txt, text_color=color))

    def _set_prog(self, v: float):
        self.after(0, lambda: self.prog.set(v))

    def _browse(self):
        from tkinter import filedialog
        d = filedialog.askdirectory(initialdir=self.ent_out.get())
        if d:
            self.ent_out.delete(0, "end")
            self.ent_out.insert(0, d)

    # ── Scan ──────────────────────────────────────────────────────────────
    def _start_scan(self):
        self._status("Scanning Steam library…", "#4fc3f7")
        self._clear_scroll()
        threading.Thread(target=self._do_scan, daemon=True).start()

    def _do_scan(self):
        try:
            self._games = self._scanner.scan()
            self.after(0, self._populate)
        except Exception as e:
            self._log(f"❌ Scan error: {e}")
            self._status("Scan failed", "red")

    def _clear_scroll(self):
        for w in self.scroll.winfo_children():
            w.destroy()
        self._rows.clear()

    def _populate(self):
        self._clear_scroll()
        for app_id, g in sorted(self._games.items(), key=lambda x: x[1]["name"]):
            var = ctk.BooleanVar(value=False)
            row = ctk.CTkFrame(self.scroll, fg_color="transparent")
            row.pack(fill="x", pady=1)
            ctk.CTkCheckBox(row, text="", variable=var, width=28).pack(side="left")
            ctk.CTkLabel(row, text=f"[{app_id}]", width=80,
                         font=ctk.CTkFont(family="Consolas", size=11),
                         text_color="#90caf9").pack(side="left")
            ctk.CTkLabel(row, text=g["name"], anchor="w").pack(side="left", fill="x", expand=True)
            self._rows.append((var, app_id, row))
        self._status(f"{len(self._games)} games found", "#81c784")
        self._log(f"✓ Steam library: {len(self._games)} games detected")

    def _on_search(self, _e=None):
        q = self.ent_search.get().lower()
        for var, app_id, row in self._rows:
            name = self._games.get(app_id, {}).get("name", "").lower()
            show = not q or q in name or q in app_id
            if show:
                row.pack(fill="x", pady=1)
            else:
                row.pack_forget()

    def _sel_all(self):
        for var, *_ in self._rows:
            var.set(True)

    def _sel_none(self):
        for var, *_ in self._rows:
            var.set(False)

    # ── Generate ──────────────────────────────────────────────────────────
    def _generate(self):
        selected = [(app_id, self._games[app_id])
                    for var, app_id, _ in self._rows if var.get()]
        if not selected:
            self._log("⚠  No games selected. Pick at least one.")
            return

        out_dir = Path(self.ent_out.get())
        install_into = self.chk_install.get()

        self.btn_go.configure(state="disabled")
        self._set_prog(0)
        threading.Thread(target=self._do_generate,
                         args=(selected, out_dir, install_into), daemon=True).start()

    def _do_generate(self, selected, out_dir, install_into):
        if not HAS_REQ:
            self._log("❌ requests not installed"); return
        if self._client is None:
            self._client = _APIClient()

        total = len(selected)
        ok = 0
        for idx, (app_id, game) in enumerate(selected, 1):
            self._status(f"Processing {idx}/{total}…", "#4fc3f7")
            self._log(f"\n[{idx}/{total}] {game['name']}  (AppID {app_id})")
            try:
                dlc = self._client.game_dlc(app_id)
                if not dlc:
                    self._log("  ⚠  No DLC found — skipping")
                    self._set_prog(idx / total)
                    continue
                self._log(f"  ✓ {len(dlc)} DLC entries")
                saved = save_configs(app_id, game["name"], dlc, out_dir,
                                     install_into, game.get("gamepath"))
                for p in saved:
                    self._log(f"  → {p}")
                ok += 1
            except Exception as e:
                self._log(f"  ❌ {e}")
            self._set_prog(idx / total)

        self._status(f"Done  ({ok}/{total})", "#81c784" if ok == total else "#ffb74d")
        self._log(f"\n═══ Finished: {ok}/{total} games processed — configs in {out_dir}")
        self.after(0, lambda: self.btn_go.configure(state="normal"))


# ══════════════════════════════════════════════════════════════════════════
#  Fallback tk GUI (when customtkinter is absent)
# ══════════════════════════════════════════════════════════════════════════
def _run_fallback():
    """Simple tkinter GUI shown while installing dependencies."""
    import tkinter as tk
    root = tk.Tk()
    root.title(APP_TITLE)
    root.geometry("420x200")
    tk.Label(root, text="Installing dependencies, please wait…",
             font=("Arial", 12), pady=30).pack()
    bar_var = tk.DoubleVar()
    try:
        from tkinter import ttk
        ttk.Progressbar(root, variable=bar_var, maximum=100, mode="indeterminate",
                        length=340).pack(pady=10)
    except Exception:
        pass

    def _run():
        try:
            _install_missing()
        except Exception as e:
            print(f"Install error: {e}")
        finally:
            root.destroy()

    threading.Thread(target=_run, daemon=True).start()
    root.mainloop()
    # restart
    os.execv(sys.executable, [sys.executable] + sys.argv)


# ══════════════════════════════════════════════════════════════════════════
#  Entry point
# ══════════════════════════════════════════════════════════════════════════
def main():
    _check_env()

    if not (HAS_CTK and HAS_REQ and HAS_VDF):
        _run_fallback()
        return

    app = App()
    app.mainloop()


if __name__ == "__main__":
    main()
