#!/usr/bin/env python3
"""
Extract scaled int8 samples from an EDF (e.g. Sleep-EDF SC4001E0-PSG.edf) for
offline demo firmware. Writes main/sleep_demo_data.h

Requires only the Python standard library. Example:

  python tools/gen_sleep_demo_from_edf.py ReferenceCode/SC4001E0-PSG.edf --channel "EEG Fpz-Cz" --max-samples 12000

If the file is truncated (partial download), reads as many complete data records as available.
"""
from __future__ import annotations

import argparse
import math
import struct
import sys
from pathlib import Path


def _read_fixed_header(f) -> dict:
    raw = f.read(256)
    if len(raw) != 256:
        raise ValueError("EDF file too short for fixed header")

    def a8(i: int) -> str:
        return raw[i : i + 8].decode("ascii", errors="replace").strip()

    version = raw[0:8].decode("ascii", errors="replace")
    if not version.startswith("0"):
        raise ValueError(f"Unexpected EDF version field: {version!r}")

    return {
        "version": version,
        "bytes_in_header": int(a8(184)),
        "num_data_records": int(a8(236)),
        "record_duration_s": float(a8(244)),
        "num_signals": int(a8(252)),
    }


def _read_signal_headers(f, ns: int) -> list[dict]:
    """EDF stores each signal-header field across all channels before the next field."""
    block = f.read(ns * 256)
    if len(block) != ns * 256:
        raise ValueError("EDF file too short for signal headers")

    def take(width: int, offset: int) -> tuple[list[str], int]:
        rows = []
        for i in range(ns):
            chunk = block[offset + i * width : offset + (i + 1) * width]
            rows.append(chunk.decode("ascii", errors="replace").strip())
        return rows, offset + ns * width

    off = 0
    labels, off = take(16, off)
    transducers, off = take(80, off)
    dims, off = take(8, off)
    phys_mins, off = take(8, off)
    phys_maxs, off = take(8, off)
    dig_mins, off = take(8, off)
    dig_maxs, off = take(8, off)
    prefilters, off = take(80, off)
    smps, off = take(8, off)
    _reserved, off = take(32, off)
    if off != ns * 256:
        raise RuntimeError("internal: signal header parse drift")

    signals = []
    for i in range(ns):
        signals.append(
            {
                "label": labels[i],
                "transducer": transducers[i],
                "dimension": dims[i],
                "phys_min": float(phys_mins[i]),
                "phys_max": float(phys_maxs[i]),
                "dig_min": int(dig_mins[i]),
                "dig_max": int(dig_maxs[i]),
                "prefilter": prefilters[i],
                "samples_per_record": int(smps[i]),
            }
        )
    return signals


def _pick_channel_index(signals: list[dict], want: str | None) -> int:
    if want is None:
        for i, s in enumerate(signals):
            lab = s["label"].upper()
            if "EEG" in lab and "FPZ" in lab and "CZ" in lab:
                return i
        return 0
    want_u = want.upper()
    for i, s in enumerate(signals):
        if want_u in s["label"].upper():
            return i
    raise ValueError(f"No channel label contains {want!r}. Labels: {[s['label'] for s in signals]}")


def _digital_to_physical(d: int, s: dict) -> float:
    pmin = s["phys_min"]
    pmax = s["phys_max"]
    dmin = s["dig_min"]
    dmax = s["dig_max"]
    if dmax == dmin:
        return pmin
    return pmin + (d - dmin) * (pmax - pmin) / (dmax - dmin)


def _scale_to_int8_microvolts_like(physical: float, scale_uv: float) -> int:
    """Map roughly microvolt-like physical units to [-100, 100]."""
    if not math.isfinite(physical):
        return 0
    v = int(round(physical * (100.0 / scale_uv)))
    if v > 127:
        return 127
    if v < -128:
        return -128
    return v


def extract_channel_int8(path: Path, channel_substring: str | None, max_samples: int, scale_uv: float) -> tuple[list[int], dict]:
    with path.open("rb") as f:
        fixed = _read_fixed_header(f)
        ns = fixed["num_signals"]
        expected = fixed["bytes_in_header"]
        if expected != 256 + ns * 256:
            raise ValueError(f"Unexpected bytes_in_header={expected} for ns={ns}")

        signals = _read_signal_headers(f, ns)
        ch = _pick_channel_index(signals, channel_substring)
        s_ch = signals[ch]

        smps = [sig["samples_per_record"] for sig in signals]
        bytes_per_record = sum(s * 2 for s in smps)

        out: list[int] = []
        rec = 0
        max_records = fixed["num_data_records"]
        while rec < max_records and len(out) < max_samples:
            raw_rec = f.read(bytes_per_record)
            if len(raw_rec) < bytes_per_record:
                break

            # De-interleave this record: for each signal, read smp * int16 little-endian
            pos = 0
            raw_by_sig: list[bytes] = []
            for smp in smps:
                nbytes = smp * 2
                raw_by_sig.append(raw_rec[pos : pos + nbytes])
                pos += nbytes
            if pos != bytes_per_record:
                raise RuntimeError("internal: record size mismatch")

            samples_bytes = raw_by_sig[ch]
            fmt = "<" + str(s_ch["samples_per_record"]) + "h"
            dig_vals = struct.unpack_from(fmt, samples_bytes, 0)
            for d in dig_vals:
                if len(out) >= max_samples:
                    break
                phys = _digital_to_physical(int(d), s_ch)
                out.append(_scale_to_int8_microvolts_like(phys, scale_uv))

            rec += 1

        meta = {
            "file": path.name,
            "channel_index": ch,
            "channel_label": s_ch["label"],
            "records_read": rec,
            "record_duration_s": fixed["record_duration_s"],
            "samples_per_record_ch": s_ch["samples_per_record"],
        }
        return out, meta


def write_header(out_path: Path, samples: list[int], meta: dict, guard_name: str, logical_source: str) -> None:
    lines = [
        "/* Auto-generated by tools/gen_sleep_demo_from_edf.py; do not edit by hand. */",
        "#pragma once",
        "",
        "#include <stddef.h>",
        "#include <stdint.h>",
        "",
        f"#define SLEEP_DEMO_SOURCE_FILE \"{logical_source}\"",
        f"#define SLEEP_DEMO_CHANNEL_INDEX ({meta['channel_index']})",
        f'#define SLEEP_DEMO_CHANNEL_LABEL "{meta["channel_label"]}"',
        f"#define SLEEP_DEMO_RECORD_DURATION_S ({meta['record_duration_s']:.6f}f)",
        f"#define SLEEP_DEMO_SAMPLES_PER_RECORD ({meta['samples_per_record_ch']})",
        f"#define SLEEP_DEMO_RECORDS_EMBEDDED ({meta['records_read']})",
        f"#define SLEEP_DEMO_SAMPLE_COUNT ({len(samples)})",
        "",
        "static const int8_t sleep_demo_samples[SLEEP_DEMO_SAMPLE_COUNT] = {",
    ]

    # ~12 ints per line keeps the header readable and small enough for editors.
    row: list[str] = []
    for i, v in enumerate(samples):
        row.append(str(v))
        if len(row) >= 12:
            lines.append("    " + ", ".join(row) + ",")
            row.clear()
    if row:
        lines.append("    " + ", ".join(row) + ("," if samples else ""))
    lines.append("};")
    lines.append("")

    text = "\n".join(lines) + "\n"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(text, encoding="utf-8")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("edf", type=Path, help="Path to .edf")
    ap.add_argument(
        "--out",
        type=Path,
        default=Path("main/sleep_demo_data.h"),
        help="Output C header path",
    )
    ap.add_argument(
        "--channel",
        default=None,
        help='Channel label substring (default: first "EEG Fpz-Cz" if present, else channel 0)',
    )
    ap.add_argument("--max-samples", type=int, default=12000, help="Cap embedded samples")
    ap.add_argument(
        "--scale-uv",
        type=float,
        default=200.0,
        help="Assumed full-scale microvolts mapped to +/-100 int8 units",
    )
    ap.add_argument(
        "--logical-source-name",
        default=None,
        help="Override SLEEP_DEMO_SOURCE_FILE string (defaults to the .edf basename)",
    )
    args = ap.parse_args()

    if args.max_samples < 1:
        print("max-samples must be >= 1", file=sys.stderr)
        return 2

    samples, meta = extract_channel_int8(args.edf, args.channel, args.max_samples, args.scale_uv)
    if len(samples) < 1:
        print("No samples extracted (truncated file or empty channel?)", file=sys.stderr)
        return 1

    logical = args.logical_source_name or meta["file"]
    write_header(args.out, samples, meta, guard_name="SLEEP_DEMO_DATA_H", logical_source=logical.replace("\\", "\\\\").replace('"', '\\"'))
    print(f"Wrote {args.out} ({len(samples)} samples) ch={meta['channel_label']!r} records={meta['records_read']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
