/**
 * User-facing copy: what estimated sleep stages generally mean for health and wellbeing.
 * (Not instructions for reading the chart.)
 */

export const STAGE_HEALTH_MODAL_TITLE = 'What sleep stages mean for your health';

export const STAGE_HEALTH_DISCLAIMER =
  'DreamRT estimates stages from your device data. Use this as a general wellness guide, not a diagnosis or treatment plan. Talk to a healthcare provider if you have ongoing sleep problems or medical concerns.';

export const STAGE_HEALTH_ENTRIES: ReadonlyArray<{ title: string; body: string }> = [
  {
    title: 'Wake',
    body:
      'Some time awake at night is normal (falling asleep, briefly waking up, bathroom trips). A lot of wake time or trouble staying asleep can leave you tired the next day and may be worth mentioning to a clinician if it persists.',
  },
  {
    title: 'Light sleep (N1/N2)',
    body:
      'Light sleep is a normal, healthy part of the night. It helps your brain and body transition between deeper sleep and REM. Cutting sleep short often reduces light sleep first, which can still affect how rested you feel.',
  },
  {
    title: 'Deep sleep (N3)',
    body:
      'Deep sleep supports physical recovery and feeling restored in the morning. Children and teens usually get more than adults. If you rarely seem to get deep sleep and you feel unrefreshed, many factors (stress, illness, sleep timing) can play a role, not only the EEG estimate.',
  },
  {
    title: 'REM sleep',
    body:
      'REM is important for mood, memory, and emotional processing. Healthy nights usually include several REM periods. Very broken sleep can reduce REM and leave people groggy or irritable; persistent issues deserve professional evaluation.',
  },
];

/** One line for the Sleep Status panel based on the latest committed stage. */
export const CURRENT_STAGE_HINT: Record<string, string> = {
  calibrating:
    'Stages appear after the first full 30-second epoch of data is processed.',
  awake:
    'Wake periods are normal in small amounts; frequent wakefulness can leave you tired and is worth discussing if it continues.',
  light:
    'Light sleep helps your body cycle through the night; steady light sleep usually supports a more even, restorative night overall.',
  deep:
    'Deep sleep supports physical recovery and morning alertness; consistently missing it can affect how restored you feel.',
  rem: 'REM supports mood and memory; getting enough REM over the night usually tracks with feeling mentally sharper the next day.',
};
