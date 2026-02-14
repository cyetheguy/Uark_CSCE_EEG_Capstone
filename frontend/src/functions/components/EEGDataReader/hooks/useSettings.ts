import { useState, useEffect, useRef } from 'react';
import { AppSettings } from '../types';

const SETTINGS_KEY_PREFIX = 'eeg-sleep-settings';
const GUEST_KEY = SETTINGS_KEY_PREFIX;

function getStorageKey(username: string | null): string {
  const user = (username || '').trim();
  return user ? `${SETTINGS_KEY_PREFIX}-${user}` : GUEST_KEY;
}

function loadSettingsFromStorage(key: string): AppSettings | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.theme) parsed.theme = 'dark';
    return parsed as AppSettings;
  } catch {
    return null;
  }
}

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  timeFormat: '24h',
  notifications: true,
  autoLoadDemoData: true,
  dataRetention: 30,
  chartType: 'waveform',
  defaultDevice: 'EEG_Sleep_Device',
  sleepStageColors: {
    awake: '#e53e3e',
    light: '#ed8936',
    deep: '#38a169',
    rem: '#667eea'
  },
  showSleepStages: true,
  showBaseline: true,
  yAxisRange: 100
};

function mergeWithDefaults(partial: Partial<AppSettings> | null): AppSettings {
  if (!partial) return DEFAULT_SETTINGS;
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    sleepStageColors: {
      ...DEFAULT_SETTINGS.sleepStageColors,
      ...(partial.sleepStageColors || {})
    }
  };
}

export const useSettings = (username: string | null = null) => {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const key = getStorageKey(username);
    const loaded = loadSettingsFromStorage(key);
    return mergeWithDefaults(loaded);
  });

  const prevUsernameRef = useRef<string | null>(username ?? null);

  // When username changes (login/logout/switch), load that account's settings
  useEffect(() => {
    const key = getStorageKey(username);
    const prevKey = getStorageKey(prevUsernameRef.current);
    prevUsernameRef.current = username ?? null;

    if (key === prevKey) return;

    const loaded = loadSettingsFromStorage(key);
    setSettings(mergeWithDefaults(loaded));
  }, [username]);

  // Persist settings to the current user's key whenever they change
  useEffect(() => {
    const key = getStorageKey(username);
    localStorage.setItem(key, JSON.stringify(settings));
  }, [username, settings]);

  // Apply theme whenever settings change
  useEffect(() => {
    const theme = settings.theme;
    let themeClass = 'theme-dark';
    if (theme === 'light' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches)) {
      themeClass = 'theme-light';
    }
    document.documentElement.className = themeClass;
  }, [settings.theme]);

  const updateSetting = (key: keyof AppSettings, value: any) => {
    setSettings(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
  };

  return {
    settings,
    updateSetting,
    resetSettings
  };
};
