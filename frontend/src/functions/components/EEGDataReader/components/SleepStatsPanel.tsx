import React from 'react';
import { SleepStats, AppSettings } from '../types';

interface SleepStatsPanelProps {
  sleepStats: SleepStats | null;
  settings: AppSettings;
}

/** Format minutes into a human-readable duration that stays meaningful at any scale. */
function formatDuration(minutes: number): string {
  if (minutes >= 60) return `${(minutes / 60).toFixed(2)} h`;
  if (minutes >= 1) return `${minutes.toFixed(1)} min`;
  return `${Math.round(minutes * 60)} s`;
}

const SleepStatsPanel: React.FC<SleepStatsPanelProps> = ({ sleepStats, settings }) => {
  if (!sleepStats) return null;

  const stageLabel: Record<string, string> = {
    awake: 'Wake',
    light: 'N1/N2 (Light)',
    deep: 'N3 (Deep)',
    rem: 'REM'
  };

  const totalMinutes = parseFloat(sleepStats.totalDuration) * 60;
  const recordingDurationDisplay = Number.isFinite(totalMinutes)
    ? (totalMinutes >= 60
      ? `${(totalMinutes / 60).toFixed(2)} h`
      : `${totalMinutes.toFixed(2)} min`)
    : '0.00 min';

  return (
    <div className="sleep-stats-panel">
      <h2>Sleep summary</h2>
      <div className="stats-grid">
        <div className="stat-card stat-card-primary">
          <div className="stat-value">{recordingDurationDisplay}</div>
          <div className="stat-label">Recording duration</div>
        </div>
        <div className="stat-card stat-card-primary">
          <div className="stat-value">{sleepStats.efficiency === '—' || sleepStats.efficiency === '' ? '—' : `${sleepStats.efficiency}%`}</div>
          <div className="stat-label">Sleep efficiency index</div>
        </div>
        <div className="stat-card stat-card-primary">
          <div className="stat-value">{sleepStats.numCycles}</div>
          <div className="stat-label">Est. sleep cycles</div>
        </div>
        {Object.entries(sleepStats.stageDurations).map(([stage, duration]) => (
          <div key={stage} className="stat-card stat-card-stage" style={{ 
            backgroundColor: `${settings.sleepStageColors[stage]}18`,
            borderColor: settings.sleepStageColors[stage]
          }}>
            <div className="stat-value" style={{ color: settings.sleepStageColors[stage] }}>
              {formatDuration(duration)}
            </div>
            <div className="stat-label" style={{ color: settings.sleepStageColors[stage] }}>
              {stageLabel[stage] ?? stage}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SleepStatsPanel;