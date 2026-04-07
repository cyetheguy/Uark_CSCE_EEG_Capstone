import React from 'react';
import { SleepSessionData } from '../types';

interface SleepStatusPanelProps {
  selectedSession: SleepSessionData | null;
  getSleepStageAtTime: (stages: any[], time: Date) => string;
  onClearData: () => void;
}

const STAGE_RANK: Record<string, { label: string; score: number; color: string }> = {
  deep: { label: 'Excellent', score: 4, color: '#68d391' },
  rem: { label: 'Very Good', score: 3, color: '#63b3ed' },
  light: { label: 'Good', score: 2, color: '#f6ad55' },
  awake: { label: 'Fair', score: 1, color: '#fc8181' }
};

const SleepStatusPanel: React.FC<SleepStatusPanelProps> = ({
  selectedSession,
  getSleepStageAtTime,
  onClearData
}) => {
  const sampleCount = selectedSession?.channelData.length ?? 0;
  const recordingMinutes = (() => {
    if (!selectedSession?.timestamps?.length || selectedSession.timestamps.length < 2) return 0;
    return (selectedSession.timestamps[selectedSession.timestamps.length - 1].getTime() - selectedSession.timestamps[0].getTime()) / 60000;
  })();

  const currentStage = (() => {
    if (!selectedSession?.timestamps?.length) return 'awake';
    const latest = selectedSession.timestamps[selectedSession.timestamps.length - 1];
    return getSleepStageAtTime(selectedSession.sleepStages, latest);
  })();

  const rank = STAGE_RANK[currentStage] ?? STAGE_RANK.awake;

  return (
    <div className="session-panel sleep-status-panel">
      <div className="panel-header">
        <h2>Sleep Status</h2>
      </div>
      <div className="session-controls">
        <div className="sleep-status-card">
          <div className="sleep-status-rank" style={{ color: rank.color }}>
            {rank.label}
          </div>
          <div className="sleep-status-stage">
            Current stage: <strong>{currentStage.toUpperCase()}</strong>
          </div>
          <div className="sleep-status-score">Rank score: {rank.score}/4</div>
          <div className="sleep-status-meta">
            <span>Samples: {sampleCount.toLocaleString()}</span>
            <span>Duration: {recordingMinutes.toFixed(2)} min</span>
          </div>
          <div className="session-actions">
            <button onClick={onClearData} className="clear-button" disabled={sampleCount === 0}>
              Clear Live Data
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SleepStatusPanel;
