import React from 'react';
import EEGChart from './EEGChart';
import { SleepSessionData, AppSettings, ChartDataPoint, EDFStreamState } from '../types';

interface VisualizationPanelProps {
  selectedSession: SleepSessionData | null;
  settings: AppSettings;
  edfStreamState: EDFStreamState;
  getSleepStageAtTime: (stages: any[], time: Date) => string;
  selectedChannel?: number;
  showRawData: boolean;
  timeView: 'overview' | 'detailed' | 'stage';
  selectedSleepStage: string;
  onShowRawDataChange: (value: boolean) => void;
  onTimeViewChange: (value: 'overview' | 'detailed' | 'stage') => void;
  onSelectedSleepStageChange: (value: string) => void;
  getChartData: () => ChartDataPoint[];
}

const VisualizationPanel: React.FC<VisualizationPanelProps> = ({
  selectedSession,
  settings,
  edfStreamState,
  getSleepStageAtTime,
  selectedChannel = 0,
  showRawData,
  timeView,
  selectedSleepStage,
  onShowRawDataChange,
  onTimeViewChange,
  onSelectedSleepStageChange,
  getChartData
}) => {
  if (!selectedSession) {
    return (
      <div className="visualization-panel">
        <div className="no-data-message">
          <p>No sleep session selected. Select a session or load demo data.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="visualization-panel">
      <div className="panel-header">
        <h2>Sleep EEG Visualization</h2>
        <div className="visualization-controls">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showRawData}
              onChange={(e) => onShowRawDataChange(e.target.checked)}
            />
            Show Raw Data
          </label>
          
          <div className="select-group">
            <label htmlFor="timeView">View:</label>
            <select
              id="timeView"
              value={timeView}
              onChange={(e) => onTimeViewChange(e.target.value as any)}
            >
              <option value="overview">Whole Night Overview</option>
              <option value="detailed">Detailed View</option>
              <option value="stage">Sleep Stage View</option>
            </select>
          </div>
          
          <div className="select-group">
            <label htmlFor="sleepStage">Sleep Stage:</label>
            <select
              id="sleepStage"
              value={selectedSleepStage}
              onChange={(e) => onSelectedSleepStageChange(e.target.value)}
              disabled={timeView !== 'stage'}
            >
              <option value="all">All Stages</option>
              <option value="awake">Awake</option>
              <option value="light">Light Sleep</option>
              <option value="deep">Deep Sleep</option>
              <option value="rem">REM Sleep</option>
            </select>
          </div>
        </div>
      </div>
      
      <div className="visualization-content">
        {/* Python real-time matplotlib graph - updates every second when streaming */}
        {edfStreamState.isStreaming ? (
          <div className="sleep-graph">
            <div className="graph-header">
              <h3>EEG Analysis (Python matplotlib – real-time)</h3>
              <span className="graph-scale">🔴 LIVE • Python updates graph every 0.1s (100Hz data)</span>
            </div>
            <div className="graph-container" style={{ textAlign: 'center', padding: '1rem', backgroundColor: '#2d3748', borderRadius: '8px' }}>
              {edfStreamState.livePlotImage ? (
                <img
                  src={edfStreamState.livePlotImage}
                  alt="EEG Signal and Power Spectrum"
                  style={{
                    width: '100%',
                    maxWidth: '1100px',
                    height: 'auto',
                    borderRadius: '8px',
                    border: '2px solid #4a5568'
                  }}
                />
              ) : edfStreamState.plotError ? (
                <div style={{ padding: '2rem', color: '#feb2b2', textAlign: 'center' }}>
                  <p><strong>Stream error:</strong></p>
                  <p>{edfStreamState.plotError}</p>
                </div>
              ) : (
                <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#cbd5e0' }}>
                  Starting Python plot stream...
                </div>
              )}
              <p style={{ color: '#cbd5e0', marginTop: '0.75rem', fontSize: '0.9rem' }}>
                backend/sessions/SC4001E0-PSG.edf • 5s window • X-axis: time into recording (seconds) • Power spectrum (Delta, Theta, Alpha, Beta)
              </p>
            </div>
            <div className="graph-footer">
              <span>Time (seconds)</span>
              <span>Amplitude (µV) / Power</span>
            </div>
          </div>
        ) : (
          <>
            <div className="sleep-graph">
              <div className="graph-header">
                <h3>Sleep EEG - Channel {selectedChannel + 1}</h3>
                <span className="graph-scale">Whole Night Sleep Session</span>
              </div>
              <div className="graph-container">
                {selectedSession.channelData.length > 0 ? (
                  <EEGChart
                    key={`chart-${selectedSession.id}-${selectedSession.channelData.length}`}
                    data={getChartData()}
                    channel={selectedChannel}
                    height={400}
                    timeRange={selectedSession.channelData.length / 100}
                    color={settings.sleepStageColors.deep}
                    showStats={true}
                    sleepStages={selectedSession.sleepStages}
                    showSleepStages={settings.showSleepStages}
                    yAxisRange={settings.yAxisRange}
                    chartType={settings.chartType}
                  />
                ) : (
                  <div style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d3748', borderRadius: '8px', color: '#cbd5e0' }}>
                    No data
                  </div>
                )}
              </div>
              <div className="graph-footer">
                <span>Time (Hours of Sleep)</span>
                <span>Amplitude (µV)</span>
              </div>
            </div>
          </>
        )}
        
        {/* Sleep Stage Timeline */}
        {settings.showSleepStages && (
          <div className="sleep-stage-timeline">
            <h3>Sleep Stage Timeline</h3>
            <div className="timeline-container">
              {selectedSession.sleepStages.map((stage, index) => (
                <div 
                  key={index}
                  className="timeline-stage"
                  style={{
                    width: `${(stage.duration / (8 * 60)) * 100}%`,
                    backgroundColor: settings.sleepStageColors[stage.type],
                    color: 'white'
                  }}
                  title={`${stage.type}: ${stage.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${stage.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${stage.duration.toFixed(1)} min)`}
                >
                  {stage.type.charAt(0).toUpperCase()}
                </div>
              ))}
            </div>
            <div className="timeline-legend">
              {Object.entries(settings.sleepStageColors).map(([stage, color]) => (
                <div key={stage} className="legend-item">
                  <span className="legend-color" style={{ backgroundColor: color }}></span>
                  <span className="legend-label">{stage.charAt(0).toUpperCase() + stage.slice(1)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Raw Data Table */}
        {showRawData && selectedSession && (
          <div className="raw-data-table">
            <h3>Sleep EEG Data Samples</h3>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Channel 1 (µV)</th>
                    <th>Sleep Stage</th>
                    <th>Quality</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSession.timestamps.slice(0, 10).map((timestamp, index) => (
                    <tr key={index}>
                      <td>{timestamp.toLocaleTimeString('en-US', { 
                        hour12: settings.timeFormat !== '24h',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}</td>
                      <td>{selectedSession.channelData[index][0].toFixed(2)}</td>
                      <td>
                        <span className="stage-badge" style={{ 
                          backgroundColor: settings.sleepStageColors[getSleepStageAtTime(selectedSession.sleepStages, timestamp)]
                        }}>
                          {getSleepStageAtTime(selectedSession.sleepStages, timestamp)}
                        </span>
                      </td>
                      <td>
                        <span className={`quality-badge quality-${selectedSession.quality}`}>
                          {selectedSession.quality}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VisualizationPanel;