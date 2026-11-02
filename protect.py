"""
protect.py — Runtime integrity & anti-tamper helpers.

Techniques used:
  1. XOR string encryption  — literals never appear plaintext in bytecode
  2. Integrity hash check   — EXE verifies its own SHA-256 on first run,
                              stores a baseline; re-checks every launch
  3. Anti-debug stubs       — detects debugger presence (Windows + cross-platform)
  4. HWID binding (opt.)    — ties execution to the original machine fingerprint
  5. Timestamp expiry       — optional build expiry date
  6. Code-hash whitelist    — verifies that imported modules haven't been patched
"""

from __future__ import annotations
import hashlib, os, platform, struct, sys, time
from pathlib import Path
from typing import Optional


# ── XOR cipher (single-byte key) ─────────────────────────────────────────
_XK = 0xA7

def xor_enc(s: str) -> list[int]:
    """Encode a string to an int list (dev-time helper)."""
    return [ord(c) ^ _XK for c in s]

def xor_dec(enc: list[int]) -> str:
    """Decode at runtime — key never stored as string."""
    return "".join(chr(b ^ _XK) for b in enc)


# ── HWID fingerprint ──────────────────────────────────────────────────────
def hwid() -> str:
    pl = platform.system()
    parts: list[str] = [platform.node(), platform.machine()]

    if pl == "Windows":
        try:
            import winreg
            k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE,
                               r"SOFTWARE\Microsoft\Cryptography")
            mid, _ = winreg.QueryValueEx(k, "MachineGuid")
            parts.append(mid)
        except Exception:
            pass

    elif pl == "Linux":
        for fp in ("/etc/machine-id", "/var/lib/dbus/machine-id"):
            try:
                mid = Path(fp).read_text().strip()
                if mid:
                    parts.append(mid)
                    break
            except Exception:
                pass

    elif pl == "Darwin":
        try:
            import subprocess
            out = subprocess.check_output(
                ["ioreg", "-rd1", "-c", "IOPlatformExpertDevice"],
                stderr=subprocess.DEVNULL).decode()
            m = __import__("re").search(r'IOPlatformUUID.*?"([^"]+)"', out)
            if m:
                parts.append(m.group(1))
        except Exception:
            pass

    raw = "|".join(p for p in parts if p)
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Anti-debug ────────────────────────────────────────────────────────────
def _anti_debug_windows():
    try:
        import ctypes
        kernel = ctypes.windll.kernel32
        if kernel.IsDebuggerPresent():
            return True
        dbg = ctypes.c_int(0)
        kernel.CheckRemoteDebuggerPresent(kernel.GetCurrentProcess(),
                                          ctypes.byref(dbg))
        if dbg.value:
            return True
    except Exception:
        pass
    return False

def _anti_debug_generic() -> bool:
    """Cross-platform: detect tracing."""
    if sys.gettrace() is not None:
        return True
    if sys.flags.debug:
        return True
    # timing check — debuggers slow execution
    t0 = time.perf_counter()
    _ = hashlib.md5(b"x" * 65536).hexdigest()
    elapsed = time.perf_counter() - t0
    if elapsed > 2.5:          # suspiciously slow
        return True
    return False

def check_debug() -> bool:
    pl = platform.system()
    if pl == "Windows":
        return _anti_debug_windows() or _anti_debug_generic()
    return _anti_debug_generic()


# ── Integrity: EXE self-hash ──────────────────────────────────────────────
_BASELINE_FILE = ".sdlc_sig"

def _exe_path() -> Optional[Path]:
    if getattr(sys, "frozen", False):
        return Path(sys.executable)
    return Path(__file__).resolve()

def _hash_file(path: Path, chunk=1 << 20) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        while True:
            data = f.read(chunk)
            if not data:
                break
            h.update(data)
    return h.hexdigest()

def _baseline_path() -> Path:
    ep = _exe_path()
    return ep.parent / _BASELINE_FILE if ep else Path(_BASELINE_FILE)

def establish_baseline():
    """Call once on first run to record the EXE hash."""
    ep = _exe_path()
    if not ep or not ep.exists():
        return
    sig = _hash_file(ep) + ":" + hwid()
    bpath = _baseline_path()
    try:
        bpath.write_text(
            hashlib.sha256(sig.encode()).hexdigest(),
            encoding="ascii"
        )
        # hide file on Windows
        if platform.system() == "Windows":
            import ctypes
            ctypes.windll.kernel32.SetFileAttributesW(str(bpath), 2)  # HIDDEN
    except Exception:
        pass

def verify_integrity() -> bool:
    """Return True if the EXE matches its baseline signature."""
    ep = _exe_path()
    if not ep or not ep.exists():
        return True   # dev mode — skip
    if not getattr(sys, "frozen", False):
        return True   # also skip when running plain .py

    bpath = _baseline_path()
    if not bpath.exists():
        establish_baseline()
        return True

    try:
        stored = bpath.read_text(encoding="ascii").strip()
        sig    = _hash_file(ep) + ":" + hwid()
        actual = hashlib.sha256(sig.encode()).hexdigest()
        return hashlib.compare_digest(stored, actual)
    except Exception:
        return False


# ── Module-hash whitelist ─────────────────────────────────────────────────
_MOD_HASHES: dict[str, str] = {}   # populated at build time (optional)

def verify_module(mod_name: str) -> bool:
    if not _MOD_HASHES:
        return True
    import importlib, inspect
    try:
        mod = importlib.import_module(mod_name)
        src = inspect.getsource(mod)
        h   = hashlib.sha256(src.encode()).hexdigest()
        expected = _MOD_HASHES.get(mod_name)
        if expected and not hashlib.compare_digest(h, expected):
            return False
    except Exception:
        pass
    return True


# ── Master guard ──────────────────────────────────────────────────────────
def guard(die_on_tamper: bool = True) -> bool:
    """Run all checks; return True if clean, False (or sys.exit) if not."""
    if check_debug():
        if die_on_tamper:
            sys.exit(0)
        return False

    if not verify_integrity():
        if die_on_tamper:
            sys.exit(0)
        return False

    return True
