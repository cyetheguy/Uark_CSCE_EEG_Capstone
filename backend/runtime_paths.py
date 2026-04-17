from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path


def get_backend_root() -> Path:
    """Return directory that contains packaged backend resources/binaries."""
    override = os.environ.get("DREAMRT_BACKEND_ROOT", "").strip()
    if override:
        return Path(override).resolve()
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def get_backend_data_root() -> Path:
    """
    Return writable runtime data location.

    Priority:
    1) DREAMRT_BACKEND_DATA_DIR env override
    2) backend root (dev fallback)
    """
    override = os.environ.get("DREAMRT_BACKEND_DATA_DIR", "").strip()
    if override:
        p = Path(override).resolve()
        p.mkdir(parents=True, exist_ok=True)
        return p
    return get_backend_root()


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
