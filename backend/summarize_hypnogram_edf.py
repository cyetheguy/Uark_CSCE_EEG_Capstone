"""
Summarize scored stage durations from a Sleep-EDF *Hypnogram*.edf (EDF+ annotations).

Requires: pip install mne

Usage (from backend/):
  python summarize_hypnogram_edf.py sessions/SC4001EC-Hypnogram.edf
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path


def main() -> None:
    try:
        import mne
    except ImportError:
        print("Install MNE: python -m pip install mne")
        sys.exit(1)

    p = Path(sys.argv[1] if len(sys.argv) > 1 else "sessions/SC4001EC-Hypnogram.edf")
    if not p.exists():
        print(f"Not found: {p}")
        sys.exit(1)

    ann = mne.read_annotations(p)
    sec: dict[str, float] = defaultdict(float)
    for i in range(len(ann)):
        desc = ann.description[i].strip()
        dur = float(ann.duration[i])
        if dur <= 0:
            dur = 30.0
        sec[desc] += dur

    print(f"File: {p.name}\n")
    total = sum(sec.values())
    for k in sorted(sec.keys()):
        s = sec[k]
        print(f"  {k}: {s / 3600:.3f} h ({s / 60:.1f} min)")
    print(f"\nTotal: {total / 3600:.3f} h")


if __name__ == "__main__":
    main()
