import React from 'react';
import { SleepSessionData } from '../types';
import { CURRENT_STAGE_HINT } from '../utils/stageInterpretationCopy';

interface SleepStatusPanelProps {
  selectedSession: SleepSessionData | null;
  onClearData: () => void;
}

const STAGE_RANK: Record<string, { label: string; score: number; color: string; stageLabel: string }> = {
  deep: { label: 'Excellent', score: 4, color: '#68d391', stageLabel: 'DEEP' },
  rem: { label: 'Very Good', score: 3, color: '#63b3ed', stageLabel: 'REM' },
  light: { label: 'Good', score: 2, color: '#f6ad55', stageLabel: 'LIGHT' },
  awake: { label: 'Fair', score: 1, color: '#fc8181', stageLabel: 'AWAKE' },
  calibrating: { label: 'Calibrating...', score: 0, color: '#a0aec0', stageLabel: 'CALIBRATING' }
};

const SleepStatusPanel: React.FC<SleepStatusPanelProps> = ({
  selectedSession,
  onClearData
}) => {
  const sampleCount = selectedSession?.channelData.length ?? 0;
  const recordingMinutes = (() => {
    if (!selectedSession?.timestamps?.length || selectedSession.timestamps.length < 2) return 0;
    return (selectedSession.timestamps[selectedSession.timestamps.length - 1].getTime() - selectedSession.timestamps[0].getTime()) / 60000;
  })();

  // Read the last committed epoch's stage directly from the append-only sleepStages array.
  // Falls back to 'calibrating' until the first commit happens (~5 min of data).
  const currentStage = (() => {
    const stages = selectedSession?.sleepStages;
    if (!stages || stages.length === 0) return 'calibrating';
    return stages[stages.length - 1].type;
  })();

  const rank = STAGE_RANK[currentStage] ?? STAGE_RANK.awake;
  const stageHint =
    CURRENT_STAGE_HINT[currentStage] ?? CURRENT_STAGE_HINT.awake;

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
            Current stage: <strong>{rank.stageLabel}</strong>
          </div>
          <div className="sleep-status-score">
            {currentStage === 'calibrating' ? 'Warming up...' : `Rank score: ${rank.score}/4`}
          </div>
          <p className="sleep-status-stage-hint">{stageHint}</p>
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
