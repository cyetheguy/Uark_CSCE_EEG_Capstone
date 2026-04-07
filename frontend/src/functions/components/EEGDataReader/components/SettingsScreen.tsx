import React, { useState } from 'react';
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
  const [isPickingFolder, setIsPickingFolder] = useState(false);
  const [folderPickerError, setFolderPickerError] = useState('');

  const handleBrowseExportFolder = async () => {
    setFolderPickerError('');
    setIsPickingFolder(true);
    try {
      const response = await fetch('http://localhost:5000/api/system/select-folder');
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !(data as any)?.success) {
        if ((data as any)?.cancelled) return;
        const msg = (data as any)?.error || 'Unable to open folder picker';
        setFolderPickerError(msg);
        return;
      }
      onUpdateSetting('exportFolder', (data as any).path);
    } catch (error: any) {
      setFolderPickerError(error?.message || 'Unable to open folder picker');
    } finally {
      setIsPickingFolder(false);
    }
  };

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
          <div className="setting-item">
            <label>Export Folder</label>
            <div className="setting-inline">
              <input
                type="text"
                value={settings.exportFolder}
                onChange={(e) => onUpdateSetting('exportFolder', e.target.value)}
                placeholder="Select an export folder"
              />
              <button
                type="button"
                className="browse-folder-button"
                onClick={handleBrowseExportFolder}
                disabled={isPickingFolder}
              >
                {isPickingFolder ? 'Opening...' : 'Browse...'}
              </button>
            </div>
            <small className="setting-note">
              Choose a folder graphically, or edit the path manually.
            </small>
            {folderPickerError && (
              <small className="setting-error">{folderPickerError}</small>
            )}
          </div>
        </div>
        
        <div className="settings-actions">
          <button 
            onClick={onResetSettings}
            className="reset-settings-button"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsScreen;