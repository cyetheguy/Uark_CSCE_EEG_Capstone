"""
Offline check: run amplitude staging on a PSG EDF and print stage minutes.
Optional: compare rough totals to a Sleep-EDF hypnogram if mne is installed.

Usage (from backend/):
  python validate_sleep_stages_offline.py
"""
from __future__ import annotations

from pathlib import Path

from data_processor import SESSIONS_DIR, get_edf_start_and_duration, read_edf_header, read_edf_samples
from sleep_stages_amplitude import compute_sleep_stages_amplitude


def _parse_edf_start_ms(path: Path) -> int:
    """
    Convert EDF start date/time fields into a unix epoch timestamp in ms.

    EDF uses a compact two-digit year (`dd.mm.yy`), so we map:
    - yy >= 80 → 19yy
    - yy < 80  → 20yy

    This is "good enough" for Sleep-EDF demo files and keeps this script dependency-free.
    """
    startdate, starttime, _ = get_edf_start_and_duration(path)
    try:
        day, month, yy = [int(x) if x.strip().isdigit() else 1 for x in startdate.split(".")]
        hour, min_, sec = [int(x) if x.strip().isdigit() else 0 for x in starttime.split(".")]
        year = (1900 + yy) if yy >= 80 else (2000 + yy) if yy < 100 else 2000
        import datetime as dt

        start_dt = dt.datetime(year, month, day, hour, min_, sec)
        return int(start_dt.timestamp() * 1000)
    except Exception:
        return 0


def main() -> None:
    """
    Quick sanity check for the amplitude-only classifier against a known EDF file:
    - Read the EDF header and cap the read length (avoid loading huge files in full)
    - Compute stage segments from the full-rate signal (classifier expects raw dynamics)
    - Print total minutes per stage

    Notes:
    - The classifier itself is heuristic; this script is for catching regressions / obvious failures,
      not for clinical validation.
    """
    psg = SESSIONS_DIR / "SC4001E0-PSG.edf"
    if not psg.exists():
        print(f"Skip: {psg} not found")
        return

    with open(psg, "rb") as fh:
        header = read_edf_header(fh)
    # Limit to <= 24h at <=128Hz for a fast offline run.
    cap = min(header["num_records"] * header["samples_per_record"][0], 24 * 3600 * 128)
    samples_arr, sfreq, label = read_edf_samples(str(psg), channel_idx=0, max_samples=int(cap))
    start_ms = _parse_edf_start_ms(psg)
    step = max(1, int(round(sfreq)))
    ds_len = len(range(0, len(samples_arr), step))
    # The review payload uses ~1Hz timestamps; we match that so the last segment end-time aligns.
    end_ts = start_ms + ds_len * 1000

    stages = compute_sleep_stages_amplitude(samples_arr, sfreq, start_ms, session_end_ms=end_ts)
    minutes: dict[str, float] = {"awake": 0.0, "light": 0.0, "deep": 0.0, "rem": 0.0}
    for s in stages:
        t = s["type"]
        if t in minutes:
            minutes[t] += float(s["duration"])

    print(f"Channel 0 ({label}), sfreq={sfreq:.2f} Hz, samples={len(samples_arr)}")
    print("Amplitude staging (minutes):", {k: round(v, 1) for k, v in minutes.items()})

    hyp = SESSIONS_DIR / "SC4001EC-Hypnogram.edf"
    if hyp.exists():
        print(f"Reference hypnogram on disk: {hyp.name} (compare totals manually or with MNE/YASA)")


if __name__ == "__main__":
    main()
