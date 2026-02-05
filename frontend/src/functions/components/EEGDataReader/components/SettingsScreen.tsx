import React from 'react';
import { AppSettings } from '../types';

interface SettingsScreenProps {
  settings: AppSettings;
  onUpdateSetting: (key: keyof AppSettings, value: any) => void;
  onResetSettings: () => void;
  onClose: () => void;
}

const SettingsScreen: React.FC<SettingsScreenProps> = ({
  settings,
  onUpdateSetting,
  onResetSettings,
  onClose
}) => {
  return (
    <div className="settings-screen">
      <div className="settings-header">
        <h2>Sleep Session Settings</h2>
        <button 
          onClick={onClose}
          className="close-settings-button"
        >
          ×
        </button>
      </div>
      
      <div className="settings-content">
        <div className="settings-group">
          <h3>Display</h3>
          <div className="setting-item">
            <label>Theme</label>
            <select 
              value={settings.theme} 
              onChange={(e) => onUpdateSetting('theme', e.target.value)}
            >
              <option value="dark">Dark Mode</option>
              <option value="light">Light Mode</option>
              <option value="auto">Auto (System)</option>
            </select>
          </div>
          
          <div className="setting-item">
            <label>Time Format</label>
            <select 
              value={settings.timeFormat} 
              onChange={(e) => onUpdateSetting('timeFormat', e.target.value)}
            >
              <option value="24h">24-hour</option>
              <option value="12h">12-hour (AM/PM)</option>
            </select>
          </div>
          
          <div className="setting-item">
            <label>Chart Type</label>
            <select 
              value={settings.chartType} 
              onChange={(e) => onUpdateSetting('chartType', e.target.value)}
            >
              <option value="waveform">Waveform</option>
              <option value="area">Area Chart</option>
              <option value="line">Line Chart</option>
            </select>
          </div>
        </div>
        
        <div className="settings-group">
          <h3>Sleep Visualization</h3>
          <div className="setting-item checkbox">
            <label>
              <input 
                type="checkbox" 
                checked={settings.showSleepStages} 
                onChange={(e) => onUpdateSetting('showSleepStages', e.target.checked)}
              />
              Show Sleep Stages
            </label>
          </div>
          
          <div className="setting-item checkbox">
            <label>
              <input 
                type="checkbox" 
                checked={settings.showBaseline} 
                onChange={(e) => onUpdateSetting('showBaseline', e.target.checked)}
              />
              Show Baseline
            </label>
          </div>
          
          <div className="setting-item">
            <label>Y-Axis Range (µV)</label>
            <div className="slider-container">
              <input 
                type="range" 
                min="50" 
                max="200" 
                step="10"
                value={settings.yAxisRange} 
                onChange={(e) => onUpdateSetting('yAxisRange', parseInt(e.target.value))}
              />
              <span className="slider-value">±{settings.yAxisRange} µV</span>
            </div>
          </div>
        </div>
        
        <div className="settings-group">
          <h3>Sleep Stage Colors</h3>
          <div className="sleep-stage-colors">
            {Object.entries(settings.sleepStageColors).map(([stage, color]) => (
              <div key={stage} className="color-picker-item">
                <label>{stage.charAt(0).toUpperCase() + stage.slice(1)} Sleep</label>
                <div className="color-picker-wrapper">
                  <input 
                    type="color" 
                    value={color} 
                    onChange={(e) => {
                      onUpdateSetting('sleepStageColors', {
                        ...settings.sleepStageColors,
                        [stage]: e.target.value
                      });
                    }}
                  />
                  <span 
                    className="color-preview" 
                    style={{ backgroundColor: color }}
                  ></span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        <div className="settings-group">
          <h3>Data Management</h3>
          <div className="setting-item checkbox">
            <label>
              <input 
                type="checkbox" 
                checked={settings.autoLoadDemoData} 
                onChange={(e) => onUpdateSetting('autoLoadDemoData', e.target.checked)}
              />
              Auto-load demo data on login
            </label>
          </div>
          
          <div className="setting-item">
            <label>Data Retention (days)</label>
            <div className="slider-container">
              <input 
                type="range" 
                min="1" 
                max="90" 
                value={settings.dataRetention} 
                onChange={(e) => onUpdateSetting('dataRetention', parseInt(e.target.value))}
              />
              <span className="slider-value">{settings.dataRetention} days</span>
            </div>
          </div>
        </div>
        
        <div className="settings-actions">
          <button 
            onClick={onResetSettings}
            className="reset-settings-button"
          >
            Reset to Defaults
          </button>
          <button 
            onClick={onClose}
            className="apply-settings-button"
          >
            Apply Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;