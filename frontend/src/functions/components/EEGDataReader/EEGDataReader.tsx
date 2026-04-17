/**
 * `EEGDataReader` is the top-level container for the DreamRT UI.
 *
 * High-level data flow:
 * - Login (frontend) → `/api/login` (backend) establishes the in-process encryption key (USR_KEY)
 * - Live mode:
 *   - `/api/device/scan` / `/api/device/connect` (optional) talk to the Desktop BLE bridge
 *   - `/api/edf/stream?mode=live` streams raw samples over SSE for the UI
 *   - The UI down-samples the plot to ~1 point/sec for rendering and periodically recomputes sleep stages
 * - Review mode:
 *   - `/api/sessions/list` returns decryptable `.eeg` sessions + optional demo `.edf` files
 *   - `/api/sessions/:id/data` returns downsampled samples + sleep stage segments for display
 *
 * Component responsibilities:
 * - This file wires together "model" hooks (`useAuth`, `useSettings`, `useSleepData`, `useUpdates`)
 *   and renders the panels. Most heavy lifting happens inside those hooks.
 */
import React, { useState, useEffect, useLayoutEffect } from 'react';
import './EEGDataReader.css';

/** Design size for scale-to-fit; entire UI scales to fit window so all aspects stay visible at any size/zoom. */
const DESIGN_WIDTH = 1600;
const DESIGN_HEIGHT = 1000;

function getViewportScale(): number {
  if (typeof window === 'undefined') return 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  
  // Disable mathematical scaling on mobile/tablet widths
  if (w <= 1024) return 1; 

  if (w <= 0 || h <= 0) return 1;
  // Do not scale above 1 so the analyzer doesn't start overly zoomed-in on large displays
  return Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT, 1);
}

// Components
import LoginScreen from './components/LoginScreen';
import Header from './components/Header';
import SettingsScreen from './components/SettingsScreen';
import SessionPanel from './components/SessionPanel';
import SleepStatusPanel from './components/SleepStatusPanel';
import SleepStatsPanel from './components/SleepStatsPanel';
import VisualizationPanel from './components/VisualizationPanel';
import UpdatesLog from './components/UpdatesLog';
import Footer from './components/Footer';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';
import { useSleepData } from './hooks/useSleepData';
import { useUpdates } from './hooks/useUpdates';

// Types
import { SleepStats } from './types';

const EEGDataReader: React.FC = () => {
  // Scale-to-fit: keep entire UI visible at any window size or zoom
  const [scale, setScale] = useState(getViewportScale);
  useLayoutEffect(() => {
    const updateScale = () => setScale(getViewportScale());
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // State
  const [mode, setMode] = useState<'live' | 'review'>('live'); // Default to live mode for EDF streaming
  const [showSettings, setShowSettings] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [showRawData, setShowRawData] = useState(false);
  const [timeView, setTimeView] = useState<'overview' | 'detailed' | 'stage'>('overview');
  const [selectedSleepStage, setSelectedSleepStage] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);

  // Custom Hooks
  const auth = useAuth();
  const settings = useSettings(auth.isAuthenticated ? auth.username : null);
  const sleepData = useSleepData();
  const updates = useUpdates(settings.settings);

  // Mode switch is the main "state machine" of the app:
  // - live → resume existing stream or start new SSE acquisition
  // - review → keep stream running in background, populate sessions list
  useEffect(() => {
    if (!auth.isAuthenticated) return;
    if (mode === 'live') {
      sleepData.setLiveUpdateEnabled(true);
      // Re-select the existing live session if the stream is still running;
      // only start a new stream when there is none.
      const existingLive = sleepData.sleepSessions.find((s) => s.id.startsWith('edf_stream_'));
      if (existingLive && sleepData.isStreamActive()) {
        sleepData.setSelectedSession(existingLive);
        updates.addUpdate('Resumed live acquisition');
      } else {
        sleepData.loadEDFPlot(auth.username || 'demo', 'live');
        updates.addUpdate('Starting live acquisition (BLE)...');
      }
    } else {
      // Stop the live stream from overwriting the displayed session so the user
      // can browse review sessions freely. The stream keeps accumulating in the
      // background via sleepSessions.
      sleepData.setLiveUpdateEnabled(false);
      sleepData.setSelectedSession(null);
      sleepData.fetchSessionList();
    }
  }, [auth.isAuthenticated, auth.username, mode]);

  useEffect(() => {
    return () => {
      sleepData.cleanupStreams();
    };
  }, []);

  // Event Handlers
  const handleModeChange = (newMode: 'live' | 'review') => {
    setMode(newMode);
    if (newMode === 'live') {
      updates.addUpdate('Switched to Live (BLE acquisition)');
    } else {
      updates.addUpdate('Switched to Review: loading encrypted sessions from server (decrypt)');
    }
  };

  const handleSelectSession = (session: any) => {
    sleepData.setSelectedSession(session);
  };

  const handleLoadSession = (sessionId: string) => {
    sleepData.loadSessionData(sessionId);
    updates.addUpdate(`Loading session ${sessionId} from server`);
  };

  const handleLoadDemoData = () => {
    sleepData.loadDemoSleepData();
    updates.addUpdate('Demo sleep session data loaded');
  };

  const handleFetchSessionList = () => {
    sleepData.fetchSessionList();
    updates.addUpdate('Refreshing session list from server');
  };

  const handleGenerateDemoSessionList = () => {
    sleepData.generateDemoSessionList();
    updates.addUpdate('Generated demo session list');
  };

  const handleUpdateSetting = (key: keyof typeof settings.settings, value: any) => {
    settings.updateSetting(key, value);
    updates.addUpdate(`Setting updated: ${key} = ${value}`);
  };

  const handleResetSettings = () => {
    settings.resetSettings();
    updates.addUpdate('Settings reset to defaults');
  };

  const handleLogout = async () => {
    try {
      // Clear backend in-memory live buffers so the next login/session starts at 0 samples.
      await fetch('/api/live/reset', { method: 'POST' });
    } catch (error) {
      // Non-fatal: still perform UI-side logout/reset below.
      console.warn('Failed to reset live backend buffers on logout:', error);
    }
    auth.handleLogout();
    sleepData.cleanupStreams();
    sleepData.setSleepSessions([]);
    sleepData.setSelectedSession(null);
    updates.addUpdate('Logged out successfully');
  };

  const handleScanDebug = async () => {
    updates.addUpdate('Sending debug scan request to EEG device...');
    try {
      // Sends "scan" to the Desktop BLE bridge. The bridge prints scan results to stdout,
      // which the backend can surface via `/api/bluetooth/hex` for troubleshooting.
      const response = await fetch('/api/device/scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ debug: true }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data?.success) {
        updates.addUpdate('✅ Debug scan command sent to Desktop client');
      } else {
        const msg = data?.error || data?.message || `HTTP ${response.status}`;
        updates.addUpdate(`❌ Debug scan failed: ${msg}`);
      }
    } catch (error: any) {
      updates.addUpdate(`❌ Debug scan error: ${error?.message || String(error)}`);
    }
  };

  /** Saves BLE buffer to an encrypted .eeg using the logged-in user's key (backend USR_KEY from /api/login). */
  const handleSaveEncryptedSession = async () => {
    // Note: we don't upload samples from the browser. The backend encrypts whatever it has buffered
    // from the BLE stream (`ble_comms.bluetooth_samples`).
    if (!sleepData.selectedSession || !sleepData.selectedSession.channelData.length) {
      updates.addUpdate('❌ No live data to save yet');
      return;
    }

    updates.addUpdate('Saving encrypted sleep session (.eeg) to server...');

    try {
      const s = sleepData.selectedSession;
      const observedSamplingRate = (() => {
        if (!s?.timestamps?.length || s.timestamps.length < 2) return 100.0;
        const spanSec = (s.timestamps[s.timestamps.length - 1].getTime() - s.timestamps[0].getTime()) / 1000;
        if (spanSec <= 0) return 100.0;
        const rate = (s.timestamps.length - 1) / spanSec;
        return Number.isFinite(rate) && rate > 0 ? rate : 100.0;
      })();
      const response = await fetch('/api/sessions/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: auth.username || 'demo',
          sampling_rate: observedSamplingRate,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && (data as any)?.success) {
        const name = (data as any).filename || 'unknown.eeg';
        updates.addUpdate(`✅ Encrypted session saved as ${name} (switch to Review → Refresh to list it)`);
      } else {
        const msg = (data as any)?.error || (data as any)?.message || `HTTP ${response.status}`;
        updates.addUpdate(`❌ Encrypted save failed: ${msg}`);
      }
    } catch (error: any) {
      updates.addUpdate(`❌ Save error: ${error?.message || String(error)}`);
    }
  };

  const handleExportLiveSession = async () => {
    if (!sleepData.selectedSession || !sleepData.selectedSession.channelData.length) {
      updates.addUpdate('❌ No live data to export yet');
      return;
    }

    updates.addUpdate(`Exporting live session to CSV (${settings.settings.exportFolder || 'backend/export'})...`);

    try {
      const response = await fetch('/api/live/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: auth.username || 'demo',
          sampling_rate: 100.0,
          output_dir: settings.settings.exportFolder,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && (data as any)?.success) {
        const name = (data as any).filename || 'unknown.csv';
        const path = (data as any).path || '';
        updates.addUpdate(`✅ Live session exported as ${name}${path ? ` (${path})` : ''}`);
      } else {
        const msg = (data as any)?.error || (data as any)?.message || `HTTP ${response.status}`;
        updates.addUpdate(`❌ Export failed: ${msg}`);
      }
    } catch (error: any) {
      updates.addUpdate(`❌ Export error: ${error?.message || String(error)}`);
    }
  };

  const handleClearData = () => {
    sleepData.setSleepSessions([]);
    sleepData.setSelectedSession(null);
    updates.addUpdate('Cleared all sleep session data');
  };

  const handleClearUpdates = () => {
    updates.clearUpdates();
  };

  // Calculations (mode-specific so live/review are independent in behavior)
  const liveSession =
    sleepData.sleepSessions.find((s) => s.id.startsWith('edf_stream_')) ?? sleepData.selectedSession;
  const statsSession = mode === 'live' ? liveSession : sleepData.selectedSession;
  const sleepStats: SleepStats | null = sleepData.calculateSleepStatsForSession(statsSession);

  // In review mode, mask the streaming flag so VisualizationPanel renders the
  // review chart instead of the live rolling-window graph.
  const effectiveStreamState = mode === 'live'
    ? sleepData.edfStreamState
    : { ...sleepData.edfStreamState, isStreaming: false };

  // Format data for EEGChart (downsample if needed so the chart renders)
  const getChartData = () => {
    if (!sleepData.selectedSession) return [];
    const session = sleepData.selectedSession;
    const n = session.timestamps.length;
    if (n === 0) return [];
    const maxPoints = 4000;
    const step = n <= maxPoints ? 1 : Math.ceil(n / maxPoints);
    let indices: number[];
    if (step === 1) {
      indices = Array.from({ length: n }, (_, i) => i);
    } else {
      indices = Array.from({ length: Math.ceil(n / step) }, (_, i) => Math.min(i * step, n - 1));
      if (indices[indices.length - 1] !== n - 1) indices.push(n - 1);
    }
    return indices.map((index) => {
      const timestamp = session.timestamps[index];
      return {
        timestamp,
        value: session.channelData[index][selectedChannel],
        channel: selectedChannel,
        deviceId: session.deviceId,
        quality: session.quality,
        sleepStage: sleepData.getSleepStageAtTime(session.sleepStages, timestamp)
      };
    });
  };

  // Scale-to-fit wrapper so all aspects stay visible at any screen size or zoom. Only apply on desktop.
  const viewportStyle = window.innerWidth > 1024 ? { transform: `scale(${scale})`, transformOrigin: 'top center' } : {};

  // Render Login Screen (inside scaled viewport)
  if (!auth.isAuthenticated) {
    return (
      <div className="eeg-app-scale-wrapper">
        <div className="eeg-app-viewport" style={viewportStyle}>
          <LoginScreen
            username={auth.username}
            password={auth.password}
            loginError={auth.loginError}
            isLoading={auth.isLoading}
            onUsernameChange={auth.setUsername}
            onPasswordChange={auth.setPassword}
            onLogin={auth.handleLogin}
          />
        </div>
      </div>
    );
  }

  // Render Main Application (inside scaled viewport)
  return (
    <div className="eeg-app-scale-wrapper">
      <div className="eeg-app-viewport" style={viewportStyle}>
      <div className="app-container">
        {showSettings && (
          <SettingsScreen
            settings={settings.settings}
            onUpdateSetting={handleUpdateSetting}
            onResetSettings={handleResetSettings}
            onClose={() => setShowSettings(false)}
          />
        )}

        <Header
          username={auth.username}
          mode={mode}
          onModeChange={handleModeChange}
          onShowSettings={() => setShowSettings(true)}
          onScanDebug={handleScanDebug}
          onLogout={handleLogout}
        />

        <main className="main-content">
          <div className="dashboard-grid">
            <section className="dashboard-left">
              {mode === 'live' ? (
                <SleepStatusPanel
                  selectedSession={sleepData.selectedSession}
                  getSleepStageAtTime={sleepData.getSleepStageAtTime}
                  onClearData={handleClearData}
                />
              ) : (
                <SessionPanel
                  mode={mode}
                  sleepSessions={sleepData.sleepSessions}
                  selectedSession={sleepData.selectedSession}
                  sessionList={sleepData.sessionList}
                  isLoading={sleepData.isLoading}
                  isLoadingSessions={sleepData.isLoadingSessions}
                  onSelectSession={handleSelectSession}
                  onLoadSession={handleLoadSession}
                  onLoadDemoData={handleLoadDemoData}
                  onFetchSessionList={handleFetchSessionList}
                  onGenerateDemoSessionList={handleGenerateDemoSessionList}
                  onClearData={handleClearData}
                />
              )}

              {mode === 'live' && sleepData.edfStreamState.isStreaming && (
                <div className="visualization-panel acquisition-panel">
                  <div className="panel-header">
                    <h2>Acquisition status</h2>
                  </div>
                  <div className="visualization-content acquisition-content">
                    <div className="acquisition-card">
                      <div className="acquisition-header">
                        <span className="acquisition-indicator" aria-hidden />
                        <span className="acquisition-title">Live acquisition</span>
                      </div>
                      <dl className="acquisition-meta">
                        <dt>Data source</dt>
                        <dd>{sleepData.selectedSession?.deviceId ?? '—'}</dd>
                        <dt>Sampling rate</dt>
                        <dd>{(() => {
                          const s = sleepData.selectedSession;
                          if (!s?.timestamps?.length) return '—';
                          if (s.timestamps.length < 2) return '—';
                          const spanSec = (s.timestamps[s.timestamps.length - 1].getTime() - s.timestamps[0].getTime()) / 1000;
                          if (spanSec <= 0) return '—';
                          const rate = (s.timestamps.length - 1) / spanSec;
                          return rate >= 1 ? `${rate.toFixed(1)} Hz` : `${(1 / rate).toFixed(1)} s per sample`;
                        })()}</dd>
                        <dt>Samples acquired</dt>
                        <dd>{sleepData.selectedSession?.channelData.length.toLocaleString() ?? 0}</dd>
                        <dt>Recording duration</dt>
                        <dd>{(() => {
                          const s = sleepData.selectedSession;
                          if (!s?.timestamps?.length) return '0';
                          if (s.timestamps.length < 2) return '0';
                          const min = (s.timestamps[s.timestamps.length - 1].getTime() - s.timestamps[0].getTime()) / 60000;
                          return `${min.toFixed(2)} min`;
                        })()}</dd>
                      </dl>
                      <div className="acquisition-actions">
                        <button
                          type="button"
                          className="primary-button"
                          onClick={handleSaveEncryptedSession}
                          disabled={!sleepData.selectedSession || !sleepData.selectedSession.channelData.length}
                        >
                          Save encrypted sleep session (.eeg)
                        </button>
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={handleExportLiveSession}
                          disabled={!sleepData.selectedSession || !sleepData.selectedSession.channelData.length}
                        >
                          Export CSV (unencrypted)
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {mode === 'review' && sleepData.selectedSession && (
                <div className="visualization-panel acquisition-panel">
                  <div className="panel-header">
                    <h2>Loaded file details</h2>
                  </div>
                  <div className="visualization-content acquisition-content">
                    <div className="acquisition-card">
                      <dl className="acquisition-meta">
                        <dt>File name</dt>
                        <dd>{sleepData.selectedSession.id || '—'}</dd>
                        <dt>Device</dt>
                        <dd>{sleepData.selectedSession.deviceId || '—'}</dd>
                        <dt>Samples loaded</dt>
                        <dd>{sleepData.selectedSession.channelData.length.toLocaleString()}</dd>
                        <dt>Recording duration</dt>
                        <dd>{(() => {
                          const s = sleepData.selectedSession;
                          if (!s.timestamps?.length || s.timestamps.length < 2) return '0 min';
                          const min = (s.timestamps[s.timestamps.length - 1].getTime() - s.timestamps[0].getTime()) / 60000;
                          return `${min.toFixed(2)} min`;
                        })()}</dd>
                      </dl>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="dashboard-center">
              {sleepData.edfStreamState.plotError && (
                <div className="visualization-panel">
                  <div className="panel-header">
                    <h2>Acquisition error</h2>
                  </div>
                  <div className="visualization-content">
                    <div className="error-message">{sleepData.edfStreamState.plotError}</div>
                  </div>
                </div>
              )}

              <VisualizationPanel
                selectedSession={sleepData.selectedSession}
                settings={settings.settings}
                edfStreamState={effectiveStreamState}
                getSleepStageAtTime={sleepData.getSleepStageAtTime}
                selectedChannel={selectedChannel}
                showRawData={showRawData}
                timeView={timeView}
                selectedSleepStage={selectedSleepStage}
                onShowRawDataChange={setShowRawData}
                onTimeViewChange={setTimeView}
                onSelectedSleepStageChange={setSelectedSleepStage}
                getChartData={getChartData}
              />
            </section>

            <section className="dashboard-right">
              <SleepStatsPanel sleepStats={sleepStats} settings={settings.settings} />
              {showRawData && (
                <UpdatesLog
                  updates={updates.updates}
                  autoScroll={autoScroll}
                  onAutoScrollChange={setAutoScroll}
                  onClearUpdates={handleClearUpdates}
                />
              )}
            </section>
          </div>
        </main>

        <Footer mode={mode} />
      </div>
      </div>
    </div>
  );
};

export default EEGDataReader;