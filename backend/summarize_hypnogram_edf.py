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
    """
    This script reads an EDF+ hypnogram file (annotations-only) and totals up time per label.
    
    Why this exists:
    - The project's runtime staging is amplitude-only and heuristic.
    - This provides a "ground truth-ish" summary from the scored hypnogram that ships with Sleep-EDF,
      which is useful for sanity-checking stage distributions.
    
    Notes:
    - MNE provides a robust EDF+ annotations reader.
    - Some hypnogram EDFs omit `duration` (or set it to 0). When that happens, Sleep-EDF uses 30s epochs,
      so we default to 30 seconds.
    """
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
