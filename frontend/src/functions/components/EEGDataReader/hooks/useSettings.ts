import { useState, useEffect } from 'react';
import { AppSettings } from '../types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  timeFormat: '24h',
  notifications: true,
  autoLoadDemoData: true,
  dataRetention: 30,
  chartType: 'waveform',
  defaultDevice: 'EEG_Sleep_Device',
  // Change the corresponding color of sleep stage
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

export const useSettings = () => {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const savedSettings = localStorage.getItem('eeg-sleep-settings');
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        if (!parsed.theme) parsed.theme = 'dark';
        setSettings(parsed);
      } catch (error) {
        console.error('Error loading settings:', error);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('eeg-sleep-settings', JSON.stringify(settings));
    
    const applyTheme = () => {
      const theme = settings.theme;
      let themeClass = 'theme-dark';
      
      if (theme === 'light' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches)) {
        themeClass = 'theme-light';
      }
      
      document.documentElement.className = themeClass;
    };
    
    applyTheme();
  }, [settings]);

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