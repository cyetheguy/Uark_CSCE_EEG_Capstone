import React from 'react';

interface HeaderProps {
  username: string;
  mode: 'live' | 'review';
  onModeChange: (mode: 'live' | 'review') => void;
  onShowSettings: () => void;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({
  username,
  mode,
  onModeChange,
  onShowSettings,
  onLogout
}) => {
  return (
    <header className="app-header">
      <div className="header-left">
        <h1>EEG Sleep Analyzer</h1>
        <p className="user-info">Logged in as: <strong>{username}</strong></p>
      </div>
      <div className="header-center">
        <div className="mode-switch">
          <span className={`mode-label ${mode === 'live' ? 'active' : ''}`}>
            Live Mode
          </span>
          <label className="switch">
            <input
              type="checkbox"
              checked={mode === 'review'}
              onChange={(e) => {
                const newMode = e.target.checked ? 'review' : 'live';
                onModeChange(newMode);
              }}
            />
            <span className="slider round"></span>
          </label>
          <span className={`mode-label ${mode === 'review' ? 'active' : ''}`}>
            Review Sessions
          </span>
        </div>
      </div>
      <div className="header-right">
        <button 
          onClick={onShowSettings}
          className="settings-button"
          title="Settings"
        >
          ⚙️ Settings
        </button>
        <button 
          onClick={onLogout}
          className="logout-button"
        >
          Logout
        </button>
      </div>
    </header>
  );
};

export default Header;