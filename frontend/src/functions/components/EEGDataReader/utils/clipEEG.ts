/**
 * Display-only sample clipping.
 *
 * Real scalp EEG rarely exceeds ~±200 µV; even large deep-sleep slow waves and
 * K-complexes peak under ~±400 µV. Anything beyond EEG_MAX_ABS_UV is almost
 * certainly electrode pop, lead-off, DC drift, or ADC saturation — not brain
 * activity. We drop those samples from chart rendering and chart statistics so
 * a single spike doesn't rescale the Y-axis or skew the Min/Avg/Max readout.
 *
 * This is intentionally display-only: stored samples, encrypted .eeg exports,
 * CSV exports, and sleep-stage computation still receive the raw values.
 */
export const EEG_MAX_ABS_UV = 500;

/**
 * Returns the value if it's a finite number within the physiologic envelope,
 * otherwise `null` (so Recharts renders a gap instead of a spike).
 */
export function clipEEGForDisplay(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  if (!Number.isFinite(v)) return null;
  if (Math.abs(v) > EEG_MAX_ABS_UV) return null;
  return v;
}
