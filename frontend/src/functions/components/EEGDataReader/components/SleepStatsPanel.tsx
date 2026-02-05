import React from 'react';
import { SleepStats, AppSettings } from '../types';

interface SleepStatsPanelProps {
  sleepStats: SleepStats | null;
  settings: AppSettings;
}

const SleepStatsPanel: React.FC<SleepStatsPanelProps> = ({ sleepStats, settings }) => {
  if (!sleepStats) return null;

  return (
    <div className="sleep-stats-panel">
      <h2>Sleep Analysis</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{sleepStats.totalDuration}h</div>
          <div className="stat-label">Total Duration</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sleepStats.efficiency}%</div>
          <div className="stat-label">Sleep Efficiency</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{sleepStats.numCycles}</div>
          <div className="stat-label">Sleep Cycles</div>
        </div>
        {Object.entries(sleepStats.stageDurations).map(([stage, duration]) => (
          <div key={stage} className="stat-card" style={{ 
            backgroundColor: `${settings.sleepStageColors[stage]}20`,
            borderColor: settings.sleepStageColors[stage]
          }}>
            <div className="stat-value" style={{ color: settings.sleepStageColors[stage] }}>
              {(duration / 60).toFixed(1)}h
            </div>
            <div className="stat-label" style={{ color: settings.sleepStageColors[stage] }}>
              {stage.charAt(0).toUpperCase() + stage.slice(1)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SleepStatsPanel;