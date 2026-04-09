/**
 * Amplitude-only sleep staging (30 s epochs). Keep in sync with backend/sleep_stages_amplitude.py
 */
import { SleepStage } from '../types';

export const EPOCH_SEC = 30;
export const SMOOTH_WINDOW = 5;
/** Commit a stage change only after this many consecutive agreeing epochs (debounce). */
export const HYSTERESIS_EPOCHS = 3;
/** Recordings this long (sec) use target wake fraction instead of percentile-only wake. */
export const LONG_RECORDING_MIN_SEC = 12 * 3600;
/** Fraction of epochs labeled awake on long recordings (~16h/24h clinical prior; no hypnogram). */
export const TARGET_WAKE_FRACTION = 0.69;
export const WAKE_SCORE_RMS_WEIGHT = 0.45;
export const WAKE_SCORE_RATIO_WEIGHT = 0.55;

export const AWAKE_RATIO_P = 78;
export const AWAKE_RMS_P = 85;
export const AWAKE_RATIO_AND_P = 58;
export const DEEP_RMS_SLEEP_P = 75;
export const DEEP_RATIO_MAX_SLEEP_P = 50;
export const REM_RATIO_SLEEP_P = 70;
export const REM_MAX_RMS_SLEEP_P = 72;

const INT_TO_TYPE: Array<SleepStage['type']> = ['awake', 'light', 'deep', 'rem'];

function rankNorm(a: number[]): number[] {
  const n = a.length;
  if (n < 2) return new Array(n).fill(0);
  const order = [...Array(n).keys()].sort((i, j) => a[i] - a[j]);
  const ranks = new Array(n).fill(0);
  for (let k = 0; k < n; k++) ranks[order[k]] = k;
  return ranks.map((r) => r / (n - 1));
}

function percentile(sortedOrValues: number[], p: number): number {
  const a = [...sortedOrValues].sort((x, y) => x - y);
  if (a.length === 0) return 0;
  const idx = (p / 100) * (a.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return a[lo];
  return a[lo] + (a[hi] - a[lo]) * (idx - lo);
}

function medianFilterInt(labels: number[], size: number): number[] {
  if (size <= 1 || labels.length <= 1) return [...labels];
  const pad = Math.floor(size / 2);
  const padded: number[] = [];
  const edge = labels[0];
  for (let i = 0; i < pad; i++) padded.push(edge);
  padded.push(...labels);
  const edgeR = labels[labels.length - 1];
  for (let i = 0; i < pad; i++) padded.push(edgeR);

  const out: number[] = [];
  for (let i = 0; i < labels.length; i++) {
    const slice = padded.slice(i, i + size);
    const s = [...slice].sort((a, b) => a - b);
    out.push(s[Math.floor(s.length / 2)]);
  }
  return out;
}

function hysteresisInt(labels: number[], nConfirm: number): number[] {
  const n = labels.length;
  if (n === 0 || nConfirm <= 1) return [...labels];
  const out: number[] = new Array(n);
  out[0] = labels[0];
  for (let i = 1; i < n; i++) {
    if (labels[i] === out[i - 1]) {
      out[i] = out[i - 1];
    } else if (i >= nConfirm - 1) {
      const v = labels[i];
      let all = true;
      for (let k = i - nConfirm + 1; k <= i; k++) {
        if (labels[k] !== v) {
          all = false;
          break;
        }
      }
      out[i] = all ? v : out[i - 1];
    } else {
      out[i] = out[i - 1];
    }
  }
  return out;
}

function mergeSegments(
  labels: number[],
  startMs: number,
  epochMs: number,
  sessionEndMs: number
): SleepStage[] {
  const n = labels.length;
  if (n === 0) return [];
  const segs: SleepStage[] = [];
  let i = 0;
  while (i < n) {
    let j = i + 1;
    while (j < n && labels[j] === labels[i]) j++;
    const t0 = startMs + i * epochMs;
    const t1 = j >= n ? sessionEndMs : startMs + j * epochMs;
    const stype = INT_TO_TYPE[labels[i]];
    segs.push({
      type: stype,
      startTime: new Date(t0),
      endTime: new Date(t1),
      duration: (t1 - t0) / (60 * 1000),
    });
    i = j;
  }
  return segs;
}

/**
 * @param samples raw amplitude samples at sfreq Hz (same channel as review)
 * @param sessionStart recording start (used for segment timestamps; live stream uses synthetic start)
 */
export function computeSleepStagesFromAmplitude(
  samples: number[],
  sfreq: number,
  sessionStart: Date,
  sessionEndMsOverride?: number,
  options?: { useTargetWake?: boolean | null; targetWakeFraction?: number }
): SleepStage[] {
  const x = samples;
  if (x.length < 2 || sfreq <= 0) return [];

  const startMs = sessionStart.getTime();
  const sessionEndMs =
    sessionEndMsOverride !== undefined
      ? sessionEndMsOverride
      : startMs + Math.round((1000 * x.length) / sfreq);

  const epochSamples = Math.max(1, Math.round(EPOCH_SEC * sfreq));
  const nEpochs = Math.floor(x.length / epochSamples);
  if (nEpochs < 1) return [];

  const rms: number[] = [];
  const ratio: number[] = [];

  for (let e = 0; e < nEpochs; e++) {
    const from = e * epochSamples;
    const seg = x.slice(from, from + epochSamples);
    if (seg.length < 2) {
      const m = seg.length ? Math.sqrt(seg.reduce((s, v) => s + v * v, 0) / seg.length) : 0;
      rms.push(m);
      ratio.push(0);
      continue;
    }
    const m = Math.sqrt(seg.reduce((s, v) => s + v * v, 0) / seg.length);
    let tv = 0;
    for (let k = 1; k < seg.length; k++) tv += Math.abs(seg[k] - seg[k - 1]);
    rms.push(m);
    ratio.push(tv / (m + 1e-9));
  }

  const pr = (arr: number[], p: number) => percentile(arr, p);

  const durationSec = x.length / sfreq;
  let twFrac =
    options?.targetWakeFraction !== undefined ? options.targetWakeFraction : TARGET_WAKE_FRACTION;
  twFrac = Math.min(0.92, Math.max(0.08, twFrac));
  let useTw: boolean;
  if (options?.useTargetWake === undefined || options?.useTargetWake === null) {
    useTw = durationSec >= LONG_RECORDING_MIN_SEC;
  } else {
    useTw = options.useTargetWake;
  }

  const isAwake = new Array(nEpochs).fill(false);
  if (useTw) {
    const rr = rankNorm(rms);
    const rq = rankNorm(ratio);
    const score = rms.map(
      (_, i) => WAKE_SCORE_RMS_WEIGHT * rr[i] + WAKE_SCORE_RATIO_WEIGHT * rq[i]
    );
    const cutoff = pr(score, 100 * (1 - twFrac));
    for (let i = 0; i < nEpochs; i++) isAwake[i] = score[i] >= cutoff;
  } else {
    for (let i = 0; i < nEpochs; i++) {
      isAwake[i] =
        ratio[i] >= pr(ratio, AWAKE_RATIO_P) ||
        (rms[i] >= pr(rms, AWAKE_RMS_P) && ratio[i] >= pr(ratio, AWAKE_RATIO_AND_P));
    }
  }

  const labels: number[] = new Array(nEpochs).fill(0);
  const sleepIdx: number[] = [];
  for (let i = 0; i < nEpochs; i++) if (!isAwake[i]) sleepIdx.push(i);

  if (sleepIdx.length === 0) {
    for (let i = 0; i < nEpochs; i++) labels[i] = 0;
  } else {
    const rmsS = sleepIdx.map((i) => rms[i]);
    const ratioS = sleepIdx.map((i) => ratio[i]);
    const p75Rms = pr(rmsS, DEEP_RMS_SLEEP_P);
    const p50Rat = pr(ratioS, DEEP_RATIO_MAX_SLEEP_P);
    const pRemRat = pr(ratioS, REM_RATIO_SLEEP_P);
    const pRemMaxRms = pr(rmsS, REM_MAX_RMS_SLEEP_P);

    for (let i = 0; i < nEpochs; i++) {
      if (isAwake[i]) labels[i] = 0;
      else if (rms[i] >= p75Rms && ratio[i] < p50Rat) labels[i] = 2;
      else if (ratio[i] >= pRemRat && rms[i] <= pRemMaxRms) labels[i] = 3;
      else labels[i] = 1;
    }
  }

  let smooth = labels;
  if (SMOOTH_WINDOW > 1 && smooth.length >= SMOOTH_WINDOW) {
    smooth = medianFilterInt(labels, SMOOTH_WINDOW);
  }

  smooth = hysteresisInt(smooth, HYSTERESIS_EPOCHS);

  const epochMs = Math.round(EPOCH_SEC * 1000);
  return mergeSegments(smooth, startMs, epochMs, sessionEndMs);
}
