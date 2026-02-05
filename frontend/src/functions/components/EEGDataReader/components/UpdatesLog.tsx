import React from 'react';

interface UpdatesLogProps {
  updates: string[];
  autoScroll: boolean;
  onAutoScrollChange: (value: boolean) => void;
  onClearUpdates: () => void;
}

const UpdatesLog: React.FC<UpdatesLogProps> = ({
  updates,
  autoScroll,
  onAutoScrollChange,
  onClearUpdates
}) => {
  return (
    <div className="updates-panel">
      <div className="panel-header">
        <h2>Activity Log</h2>
        <div className="log-controls">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => onAutoScrollChange(e.target.checked)}
            />
            Auto-scroll
          </label>
          <button 
            onClick={onClearUpdates}
            className="clear-log-button"
            disabled={updates.length === 0}
          >
            Clear Log
          </button>
        </div>
      </div>
      
      <div 
        id="updates-log"
        className="updates-log"
      >
        {updates.length === 0 ? (
          <div className="empty-log">No activity yet.</div>
        ) : (
          updates.map((update, index) => (
            <div 
              key={index} 
              className={`update-entry ${update.includes('Error') ? 'error' : update.includes('loaded') ? 'success' : ''}`}
            >
              {update}
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default UpdatesLog;