from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def get_backend_root() -> Path:
    """Return the directory that contains packaged backend resources/binaries
    (read-only bundled data like CommunicationManager/main.exe, demo EDFs, etc.).

    Priority:
    1) DREAMRT_BACKEND_ROOT env override (useful for dev / tests)
    2) When frozen by PyInstaller:
       - PyInstaller >= 6 (onedir): `sys._MEIPASS` points at the `_internal`
         directory where --add-data bundles are placed.
       - Older layouts: `sys.executable.parent`.
       We try `_MEIPASS` first and fall back to exe dir.
    3) Source-run: the directory containing this file.
    """
    override = os.environ.get("DREAMRT_BACKEND_ROOT", "").strip()
    if override:
        return Path(override).resolve()
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            return Path(meipass).resolve()
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def get_backend_data_root() -> Path:
    """
    Return writable runtime data location.

    Priority:
    1) DREAMRT_BACKEND_DATA_DIR env override (Electron sets this to
       `app.getPath('userData')/backend-data` in packaged builds).
    2) When frozen: a sibling `backend-data` folder next to the EXE. This
       lives outside the read-only `_internal` payload so the app can still
       save sessions even if no env override is set.
    3) Source-run: the backend source directory.
    """
    override = os.environ.get("DREAMRT_BACKEND_DATA_DIR", "").strip()
    if override:
        p = Path(override).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p
    if getattr(sys, "frozen", False):
        p = Path(sys.executable).resolve().parent / "backend-data"
        p.mkdir(parents=True, exist_ok=True)
        return p
    return Path(__file__).resolve().parent


def ensure_runtime_data_dirs() -> None:
    """
    Ensure writable runtime folders exist and are seeded with shipped assets when needed.
    """
    backend_root = get_backend_root()
    data_root = get_backend_data_root()

    for dirname in ("sessions", "user", "export"):
        (data_root / dirname).mkdir(parents=True, exist_ok=True)

    # Seed built-in demo files/credentials once (if empty destination).
    for dirname in ("sessions", "user"):
        src = backend_root / dirname
        dst = data_root / dirname
        if not src.exists() or any(dst.iterdir()):
            continue
        for item in src.iterdir():
            target = dst / item.name
            if item.is_dir():
                shutil.copytree(item, target, dirs_exist_ok=True)
            else:
                shutil.copy2(item, target)
