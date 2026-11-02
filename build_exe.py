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

import subprocess, sys, shutil, os, hashlib, time
from pathlib import Path
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────
ENTRY      = "steam_dlc_pro.py"
APP_NAME   = "SteamDLCPro"
APP_VER    = "2.0.0"
ICON_ICO   = "assets/icon.ico"      # optional — ignored if missing
ICON_PNG   = "assets/icon.png"      # optional
ONEFILE    = "--onedir" not in sys.argv[1:]
USE_ARMOUR = False  # PyArmor trial blocks execution on large scripts; disable

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
    "--hidden-import",      "urllib3",
    "--hidden-import",      "certifi",
    "--collect-data",       "certifi",  # SSL certificates for HTTPS
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

def _pyarmor_version() -> tuple[int, ...]:
    try:
        out = subprocess.check_output(["pyarmor", "--version"],
                                      stderr=subprocess.STDOUT).decode()
        import re
        m = re.search(r"(\d+)\.(\d+)", out)
        if m:
            return (int(m.group(1)), int(m.group(2)))
    except Exception:
        pass
    return (0, 0)

# ── Step 0: ensure tools ──────────────────────────────────────────────────
def ensure_tools():
    print("[0/5] Ensuring build tools…")
    pkgs = ["pyinstaller", "customtkinter", "requests", "vdf", "Pillow"]
    run(sys.executable, "-m", "pip", "install", "--quiet", *pkgs)

# ── Step 1: optional PyArmor obfuscation ─────────────────────────────────
def obfuscate() -> str:
    """Return path to obfuscated entry script, or original if pyarmor absent."""
    if not USE_ARMOUR:
        print("[1/5] PyArmor not found — skipping obfuscation")
        return ENTRY

    ver = _pyarmor_version()
    print(f"[1/5] Obfuscating with PyArmor {ver[0]}.{ver[1]}…")
    out_dir = Path("dist_obf")
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir()

    if ver[0] >= 9:
        # PyArmor 9.x API: pyarmor gen --output <dir> <script>
        extra_scripts = [f for f in ("steam_dlc_manager.py", "protect.py")
                         if Path(f).exists()]
        run("pyarmor", "gen", "--output", str(out_dir),
            ENTRY, *extra_scripts)
    else:
        # PyArmor 7/8 legacy API
        run("pyarmor", "obfuscate", "--output", str(out_dir),
            ENTRY, "steam_dlc_manager.py", "protect.py")

    new_entry = out_dir / ENTRY
    if new_entry.exists():
        print(f"  ✓ Obfuscated entry: {new_entry}")
        return str(new_entry)

    print("  ⚠  Obfuscated file not found — falling back to plain source")
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
    flags = list(PYINST_FLAGS)
    flags += ["--add-data", f"protect.py{os.pathsep}."]

    # Always scan dist_obf for PyArmor runtime folders (pyarmor_runtime_xxxxxx)
    # regardless of where entry lives — inject_metadata moves entry to "."
    # but the runtime stays in dist_obf.
    obf_dir = Path("dist_obf")
    if obf_dir.exists():
        for rt in obf_dir.glob("pyarmor_runtime_*"):
            if rt.is_dir():
                print(f"  + bundling PyArmor runtime: {rt.name}")
                flags += ["--add-data", f"{rt}{os.pathsep}{rt.name}"]
                flags += ["--hidden-import", rt.name]

    run(sys.executable, "-m", "PyInstaller", *flags, entry)

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
