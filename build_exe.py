#!/usr/bin/env python3
"""
build_exe.py — Compile steam_dlc_pro.py into a single protected EXE.

Usage:
    python build_exe.py               (Windows → .exe, Linux/Mac → binary)
    python build_exe.py --onefile     (default)
    python build_exe.py --onedir      (faster startup, folder output)

Requirements:
    pip install pyinstaller customtkinter requests vdf Pillow pyarmor
"""

import subprocess, sys, shutil, os, hashlib, json, time
from pathlib import Path
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────
ENTRY      = "steam_dlc_pro.py"
APP_NAME   = "SteamDLCPro"
APP_VER    = "2.0.0"
ICON_ICO   = "assets/icon.ico"      # optional — ignored if missing
ICON_PNG   = "assets/icon.png"      # optional
ONEFILE    = "--onefile" not in sys.argv[1:] or "--onefile" in sys.argv[1:]
USE_ARMOUR = shutil.which("pyarmor") is not None

PYINST_FLAGS = [
    "--noconfirm",
    "--clean",
    "--name", APP_NAME,
    "--collect-submodules", "customtkinter",
    "--collect-data",       "customtkinter",
    "--collect-submodules", "vdf",
    "--hidden-import",      "PIL._tkinter_finder",
    "--hidden-import",      "vdf",
    "--hidden-import",      "requests",
    "--hidden-import",      "protect",
]

if ONEFILE:
    PYINST_FLAGS.append("--onefile")
else:
    PYINST_FLAGS.append("--onedir")

if Path(ICON_ICO).exists():
    PYINST_FLAGS += ["--icon", ICON_ICO]
elif Path(ICON_PNG).exists():
    PYINST_FLAGS += ["--icon", ICON_PNG]

# Windows-only: no console window
if sys.platform == "win32":
    PYINST_FLAGS += ["--noconsole", "--uac-admin"]

# ── Helpers ───────────────────────────────────────────────────────────────
def run(*cmd, **kw):
    print(f"\n▶  {' '.join(str(c) for c in cmd)}\n")
    subprocess.check_call([str(c) for c in cmd], **kw)

def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()

# ── Step 0: ensure tools ──────────────────────────────────────────────────
def ensure_tools():
    print("[0/5] Ensuring build tools…")
    pkgs = ["pyinstaller", "customtkinter", "requests", "vdf", "Pillow"]
    run(sys.executable, "-m", "pip", "install", "--quiet", *pkgs)

# ── Step 1: optional PyArmor obfuscation ─────────────────────────────────
def obfuscate() -> str:
    """Return path to obfuscated entry script, or original if pyarmor absent."""
    if not USE_ARMOUR:
        print("[1/5] PyArmor not found — skipping obfuscation (install with: pip install pyarmor)")
        return ENTRY

    print("[1/5] Obfuscating with PyArmor…")
    out_dir = Path("dist_obf")
    if out_dir.exists():
        shutil.rmtree(out_dir)
    run("pyarmor", "pack", "-e", "--onefile", "-n", APP_NAME, ENTRY)
    # pyarmor produces its own dist — find the exe if already done
    # For the source-only obfuscation path:
    run("pyarmor", "obfuscate", "--output", str(out_dir), ENTRY,
        "steam_dlc_manager.py", "protect.py")
    new_entry = out_dir / ENTRY
    if new_entry.exists():
        return str(new_entry)
    return ENTRY

# ── Step 2: inject build metadata ─────────────────────────────────────────
def inject_metadata(entry: str) -> str:
    """Stamp version + build date into a temp copy of the entry file."""
    print("[2/5] Injecting build metadata…")
    src  = Path(entry).read_text(encoding="utf-8")
    stamp = (f'\n_BUILD_DATE = "{datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}"\n'
             f'_BUILD_HASH = "{hashlib.md5(src.encode()).hexdigest()}"\n')
    new_name = "_build_entry.py"
    with open(new_name, "w", encoding="utf-8") as f:
        f.write("# AUTO-GENERATED — DO NOT EDIT\n" + stamp + src)
    return new_name

# ── Step 3: PyInstaller compile ───────────────────────────────────────────
def compile_exe(entry: str):
    print(f"[3/5] Compiling {entry} → EXE…")
    run(sys.executable, "-m", "PyInstaller",
        *PYINST_FLAGS, "--add-data", f"protect.py{os.pathsep}.",
        entry)

# ── Step 4: post-process ──────────────────────────────────────────────────
def post_process():
    print("[4/5] Post-processing output…")
    dist = Path("dist")
    if ONEFILE:
        candidates = list(dist.glob(f"{APP_NAME}*"))
    else:
        candidates = list((dist / APP_NAME).glob("*"))

    if not candidates:
        print("  ⚠  No output files found — check PyInstaller log")
        return

    for exe in candidates:
        if exe.is_file():
            h = sha256(exe)
            print(f"  SHA-256  {exe.name}: {h}")
            # write checksum file alongside
            (exe.parent / f"{exe.name}.sha256").write_text(h + "\n", encoding="ascii")

    # clean temp
    for tmp in ("_build_entry.py", "__pycache__", "build", "dist_obf",
                f"{APP_NAME}.spec"):
        p = Path(tmp)
        if p.is_dir():
            shutil.rmtree(p, ignore_errors=True)
        elif p.is_file():
            p.unlink(missing_ok=True)

# ── Step 5: summary ───────────────────────────────────────────────────────
def summary():
    print("[5/5] Build complete.\n")
    dist = Path("dist")
    for f in sorted(dist.rglob("*")):
        if f.is_file() and not f.suffix == ".sha256":
            size = f.stat().st_size
            print(f"  {str(f):<55}  {size/1024:.0f} KB")
    print(f"\n  Output folder: {dist.resolve()}")

# ── Main ──────────────────────────────────────────────────────────────────
def main():
    t0 = time.time()
    print("╔══════════════════════════════════════════╗")
    print(f"║  {APP_NAME} v{APP_VER} — EXE Builder              ║")
    print("╚══════════════════════════════════════════╝\n")

    ensure_tools()
    entry = obfuscate()
    entry = inject_metadata(entry)

    try:
        compile_exe(entry)
    except subprocess.CalledProcessError as e:
        print(f"\n❌ PyInstaller failed (exit {e.returncode})")
        sys.exit(1)

    post_process()
    summary()
    print(f"\n  Total build time: {time.time()-t0:.1f}s")


if __name__ == "__main__":
    main()
