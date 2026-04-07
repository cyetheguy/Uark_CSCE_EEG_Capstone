"""
Amplitude-only sleep staging (30 s epochs). Mirrors frontend sleepStagesFromAmplitude.ts.

Uses RMS, total variation (sum |diff|), and TV/RMS ratio; robust percentiles; median smoothing;
then hysteresis (stage change only after HYSTERESIS_EPOCHS consecutive agreeing labels).
Prioritizes Wake (high roughness) and REM (sleep + elevated roughness vs smooth NREM).
"""
from __future__ import annotations

import datetime as dt
from typing import Any, Dict, List, Tuple

import numpy as np

# Keep in sync with frontend/src/functions/components/EEGDataReader/utils/sleepStagesFromAmplitude.ts
EPOCH_SEC: float = 30.0
SMOOTH_WINDOW: int = 5  # odd, epochs
HYSTERESIS_EPOCHS: int = 3  # commit stage change only after this many agreeing epochs

# Long recordings (e.g. 24 h Sleep-EDF): expert labels are often ~65–70% wake. Amplitude-only rules
# that fire only on "high roughness" under-count wake (quiet rest looks like sleep). For
# duration >= LONG_RECORDING_MIN_SEC we split wake/sleep by ranking a composite score and taking
# the top TARGET_WAKE_FRACTION of epochs as awake (no hypnogram required — baseline prior).
LONG_RECORDING_MIN_SEC: float = 12 * 3600.0
TARGET_WAKE_FRACTION: float = 0.69  # ~16.6 h / 24 h (Sleep-EDF hypnogram ballpark); smoothing shifts totals slightly
WAKE_SCORE_RMS_WEIGHT: float = 0.45
WAKE_SCORE_RATIO_WEIGHT: float = 0.55

# Short recordings / fallback: percentile gates (wake = high roughness or high RMS + roughness).
AWAKE_RATIO_P: float = 78.0
AWAKE_RMS_P: float = 85.0
AWAKE_RATIO_AND_P: float = 58.0
DEEP_RMS_SLEEP_P: float = 75.0
DEEP_RATIO_MAX_SLEEP_P: float = 50.0
# Stricter REM: must be in upper tail of roughness among sleep epochs only.
REM_RATIO_SLEEP_P: float = 70.0
# REM: also require below deep-like RMS (desynchronized vs slow-wave bulk).
REM_MAX_RMS_SLEEP_P: float = 72.0

INT_TO_TYPE: Tuple[str, ...] = ("awake", "light", "deep", "rem")


def _median_filter_int(labels: np.ndarray, size: int) -> np.ndarray:
    if size <= 1 or len(labels) <= 1:
        return labels.copy()
    pad = size // 2
    padded = np.pad(labels, pad, mode="edge")
    out = np.empty_like(labels, dtype=np.int8)
    for i in range(len(labels)):
        out[i] = int(np.median(padded[i : i + size]))
    return out


def _hysteresis_int(labels: np.ndarray, n_confirm: int) -> np.ndarray:
    """Emit a new stage only after it appears in n_confirm consecutive raw epochs (debounce)."""
    n = len(labels)
    if n == 0 or n_confirm <= 1:
        return labels.copy()
    out = np.empty_like(labels, dtype=np.int8)
    out[0] = int(labels[0])
    for i in range(1, n):
        if int(labels[i]) == int(out[i - 1]):
            out[i] = out[i - 1]
        elif i >= n_confirm - 1:
            win = labels[i - n_confirm + 1 : i + 1]
            if np.all(win == labels[i]):
                out[i] = int(labels[i])
            else:
                out[i] = out[i - 1]
        else:
            out[i] = out[i - 1]
    return out


def _iso_utc(ms: int) -> str:
    return dt.datetime.utcfromtimestamp(ms / 1000.0).isoformat() + "Z"


def _rank_norm(a: np.ndarray) -> np.ndarray:
    """Map values to [0,1] by rank (0 = smallest)."""
    n = int(a.size)
    if n < 2:
        return np.zeros(n, dtype=np.float64)
    order = np.argsort(np.argsort(a.astype(np.float64)))
    return order.astype(np.float64) / float(n - 1)


def _merge_segments(labels: np.ndarray, start_ms: int, epoch_ms: int, session_end_ms: int) -> List[Dict[str, Any]]:
    segs: List[Dict[str, Any]] = []
    n = len(labels)
    if n == 0:
        return segs
    i = 0
    while i < n:
        j = i + 1
        while j < n and int(labels[j]) == int(labels[i]):
            j += 1
        t0 = start_ms + i * epoch_ms
        t1 = session_end_ms if j >= n else start_ms + j * epoch_ms
        stype = INT_TO_TYPE[int(labels[i])]
        segs.append(
            {
                "type": stype,
                "startTime": _iso_utc(t0),
                "endTime": _iso_utc(t1),
                "duration": (t1 - t0) / (60.0 * 1000.0),
            }
        )
        i = j
    return segs


def compute_sleep_stages_amplitude(
    samples: np.ndarray | List[float],
    sfreq: float,
    start_ms: int,
    session_end_ms: int | None = None,
    *,
    use_target_wake: bool | None = None,
    target_wake_fraction: float | None = None,
) -> List[Dict[str, Any]]:
    """
    Build sleep stage segments from raw samples at sfreq Hz.
    If session_end_ms is set (e.g. to match 1 Hz review payload), last segment ends there.

    use_target_wake: None = auto (target split if recording duration >= LONG_RECORDING_MIN_SEC).
    target_wake_fraction: override TARGET_WAKE_FRACTION when use_target_wake is True.
    """
    x = np.asarray(samples, dtype=np.float64)
    if x.size < 2 or sfreq <= 0:
        return []

    if session_end_ms is None:
        session_end_ms = start_ms + int(round(1000.0 * float(x.size) / sfreq))
    epoch_samples = max(1, int(round(EPOCH_SEC * sfreq)))
    n_epochs = int(x.size // epoch_samples)
    if n_epochs < 1:
        return []

    rms = np.zeros(n_epochs)
    ratio = np.zeros(n_epochs)

    for e in range(n_epochs):
        seg = x[e * epoch_samples : (e + 1) * epoch_samples]
        if seg.size < 2:
            rms[e] = float(np.sqrt(np.mean(seg**2))) if seg.size else 0.0
            ratio[e] = 0.0
            continue
        rms[e] = float(np.sqrt(np.mean(seg**2)))
        tv = float(np.sum(np.abs(np.diff(seg))))
        ratio[e] = tv / (rms[e] + 1e-9)

    duration_sec: float = float(x.size) / sfreq
    tw_frac: float = TARGET_WAKE_FRACTION if target_wake_fraction is None else float(target_wake_fraction)
    tw_frac = min(0.92, max(0.08, tw_frac))
    if use_target_wake is None:
        use_tw = duration_sec >= LONG_RECORDING_MIN_SEC
    else:
        use_tw = bool(use_target_wake)

    if use_tw:
        rr = _rank_norm(rms)
        rq = _rank_norm(ratio)
        score = WAKE_SCORE_RMS_WEIGHT * rr + WAKE_SCORE_RATIO_WEIGHT * rq
        # Top tw_frac of epochs = awake (~matches long 24h clinical wake fraction).
        cutoff = float(np.percentile(score, 100.0 * (1.0 - tw_frac)))
        is_awake = score >= cutoff
    else:
        is_awake = (ratio >= np.percentile(ratio, AWAKE_RATIO_P)) | (
            (rms >= np.percentile(rms, AWAKE_RMS_P))
            & (ratio >= np.percentile(ratio, AWAKE_RATIO_AND_P))
        )

    labels = np.zeros(n_epochs, dtype=np.int8)
    sleep_mask = ~is_awake
    if not np.any(sleep_mask):
        labels[:] = 0
    else:
        rms_s = rms[sleep_mask]
        ratio_s = ratio[sleep_mask]
        p75_rms = float(np.percentile(rms_s, DEEP_RMS_SLEEP_P))
        p50_rat = float(np.percentile(ratio_s, DEEP_RATIO_MAX_SLEEP_P))
        p_rem_rat = float(np.percentile(ratio_s, REM_RATIO_SLEEP_P))
        p_rem_max_rms = float(np.percentile(rms_s, REM_MAX_RMS_SLEEP_P))

        for i in range(n_epochs):
            if is_awake[i]:
                labels[i] = 0
            else:
                if rms[i] >= p75_rms and ratio[i] < p50_rat:
                    labels[i] = 2
                elif ratio[i] >= p_rem_rat and rms[i] <= p_rem_max_rms:
                    labels[i] = 3
                else:
                    labels[i] = 1

    if SMOOTH_WINDOW > 1 and len(labels) >= SMOOTH_WINDOW:
        labels = _median_filter_int(labels, SMOOTH_WINDOW)

    labels = _hysteresis_int(labels, HYSTERESIS_EPOCHS)

    epoch_ms = int(round(EPOCH_SEC * 1000))
    return _merge_segments(labels, start_ms, epoch_ms, session_end_ms)
