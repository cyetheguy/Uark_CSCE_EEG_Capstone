import React from 'react';
import { SessionMetadata, SleepSessionData } from '../types';

interface SessionPanelProps {
  mode: 'live' | 'review';
  sleepSessions: SleepSessionData[];
  selectedSession: SleepSessionData | null;
  sessionList: SessionMetadata[];
  isLoading: boolean;
  isLoadingSessions: boolean;
  onSelectSession: (session: SleepSessionData) => void;
  onLoadSession: (sessionId: string) => void;
  onLoadDemoData: () => void;
  onFetchSessionList: () => void;
  onGenerateDemoSessionList: () => void;
  onClearData: () => void;
}

const SessionPanel: React.FC<SessionPanelProps> = ({
  mode,
  sleepSessions,
  selectedSession,
  sessionList,
  isLoading,
  isLoadingSessions,
  onSelectSession,
  onLoadSession,
  onLoadDemoData,
  onFetchSessionList,
  onGenerateDemoSessionList,
  onClearData
}) => {
  return (
    <div className="session-panel">
      <div className="panel-header">
        <h2>{mode === 'live' ? 'Live Sessions' : 'Sleep Sessions'}</h2>
        {mode === 'review' && (
          <button 
            onClick={onFetchSessionList}
            className="refresh-button"
            disabled={isLoadingSessions}
            title="Refresh session list"
          >
            {isLoadingSessions ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        )}
      </div>
      
      <div className="session-controls">
        {mode === 'review' ? (
          <div className="session-list">
            {isLoadingSessions ? (
              <div className="loading-sessions">
                <p>Loading sessions from server...</p>
              </div>
            ) : sessionList.length > 0 ? (
              <>
                {sessionList.map((session) => {
                  const isLoaded = sleepSessions.some(s => s.id === session.id);
                  
                  return (
                    <div 
                      key={session.id} 
                      className={`session-card ${selectedSession?.id === session.id ? 'active' : ''} ${isLoaded ? 'loaded' : ''}`}
                      onClick={() => {
                        if (isLoaded) {
                          const loadedSession = sleepSessions.find(s => s.id === session.id);
                          if (loadedSession) {
                            onSelectSession(loadedSession);
                          }
                        }
                      }}
                    >
                      <div className="session-meta">
                        <div className="session-date">
                          {session.date}
                        </div>
                        <div className="session-time-range">
                          {session.hourRange}
                        </div>
                        <div className="session-device">
                          {session.deviceId}
                        </div>
                      </div>
                      
                      <div className="session-actions">
                        {isLoaded ? (
                          <span className="loaded-badge">✓ Loaded</span>
                        ) : (
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              onLoadSession(session.id);
                            }}
                            className="load-session-button"
                            disabled={isLoading}
                          >
                            {isLoading ? 'Loading...' : 'Load Session'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div className="no-sessions">
                <p>No sleep sessions available on server.</p>
                <button 
                  onClick={onGenerateDemoSessionList}
                  className="load-demo-button"
                >
                  Load Demo Session List
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="session-list">
            {sleepSessions.length > 0 ? (
              <>
                {sleepSessions.map((session) => (
                  <div 
                    key={session.id} 
                    className={`session-card ${selectedSession?.id === session.id ? 'active' : ''}`}
                    onClick={() => onSelectSession(session)}
                  >
                    <div className="session-meta">
                      <div className="session-date">
                        {session.startTime.toLocaleDateString()}
                      </div>
                      <div className="session-time-range">
                        {session.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
                        {session.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                      <div className="session-duration">
                        {((session.endTime.getTime() - session.startTime.getTime()) / (60 * 60 * 1000)).toFixed(1)} hours
                      </div>
                    </div>
                    <div className={`session-quality quality-${session.quality}`}>
                      {session.quality}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div className="no-sessions">
                <p>No sleep sessions available in live mode.</p>
                <button 
                  onClick={onLoadDemoData}
                  className="load-demo-button"
                >
                  Start Live Demo Session
                </button>
              </div>
            )}
          </div>
        )}
        
        {/* Clear button for live mode */}
        {mode === 'live' && sleepSessions.length > 0 && (
          <div className="session-actions">
            <button 
              onClick={onClearData}
              className="clear-button"
            >
              Clear All Sessions
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionPanel;