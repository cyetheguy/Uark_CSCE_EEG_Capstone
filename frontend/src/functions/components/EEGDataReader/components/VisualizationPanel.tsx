import React, { useState, useMemo, useEffect } from 'react';
import { SleepSessionData, AppSettings, ChartDataPoint, EDFStreamState } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, ComposedChart, ReferenceArea 
} from 'recharts';
import SleepStageHealthModal from './SleepStageHealthModal';

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

// Target Y-Values for each stage
const STAGE_TARGETS: Record<string, number> = {
  awake: 4,
  light: 3,
  rem: 2,
  deep: 1
};

// Colors for the stacked layers
const STAGE_COLORS: Record<string, string> = {
  awake: '#e53e3e', // Red
  light: '#ed8936', // Orange
  rem: '#3182ce',   // Blue
  deep: '#38a169',  // Green
  calibrating: '#a0aec0', // Gray — shown during the first ~5 min before any epoch is committed
};

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
  const [hoverData, setHoverData] = useState<{ value: number; time: string; stage: string } | null>(null);
  
  // Split interaction into hovering (temporary) and scrubbing/paused (persistent)
  const [isHovering, setIsHovering] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [manualScrollIndex, setManualScrollIndex] = useState<number>(0);
  const [stageHealthModalOpen, setStageHealthModalOpen] = useState(false);

  const LIVE_WINDOW_SAMPLES = 60;
  const currentDataLength = selectedSession?.channelData.length || 0;

  // Keep manualScrollIndex up to date with the live edge when NOT paused or hovering
  useEffect(() => {
    if (!isPaused && !isHovering && currentDataLength > 0) {
      setManualScrollIndex(currentDataLength - 1);
    }
  }, [currentDataLength, isPaused, isHovering]);

  const { startIndex, endIndex, windowSize } = useMemo(() => {
    if (currentDataLength === 0) return { startIndex: 0, endIndex: 0, windowSize: 0 };
    
    // Use manual index if paused by slider OR paused by hovering
    const endIdx = (isPaused || isHovering)
      ? Math.min(manualScrollIndex, currentDataLength - 1)
      : currentDataLength - 1;

    const startIdx = Math.max(0, endIdx - LIVE_WINDOW_SAMPLES + 1);
    return { startIndex: startIdx, endIndex: endIdx, windowSize: endIdx - startIdx + 1 };
  }, [selectedSession, isPaused, isHovering, manualScrollIndex, currentDataLength]);

  const realTimeData = useMemo(() => {
    if (!selectedSession || currentDataLength === 0 || windowSize === 0) return [];

    const sliceData = selectedSession.channelData.slice(startIndex, endIndex + 1);
    const sliceTimestamps = selectedSession.timestamps.slice(startIndex, endIndex + 1);
    const data: Array<{ index: number; value: number; stage: string; stageLevel: number; timeStr: string }> = [];

    for (let i = 0; i < sliceData.length; i++) {
      const ts = sliceTimestamps[i];
      const stage = getSleepStageAtTime(selectedSession.sleepStages, ts);
      const stageLevel = STAGE_TARGETS[stage] ?? 1; // discrete: 1=N3, 2=REM, 3=N1/N2, 4=Wake

      data.push({
        index: startIndex + i,
        value: sliceData[i][0],
        stage,
        stageLevel,
        timeStr: ts.toLocaleTimeString('en-US', {
          hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
        }) + `.${Math.floor(ts.getMilliseconds() / 100)}`
      });
    }

    return data;
  }, [selectedSession, startIndex, endIndex, windowSize, currentDataLength, getSleepStageAtTime]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    const safeVal = Math.min(val, currentDataLength - 1);
    setManualScrollIndex(safeVal);
    
    // Auto-resume if they drag the slider to the very end
    if (safeVal >= currentDataLength - 1) {
      setIsPaused(false);
    } else {
      setIsPaused(true);
    }
  };

  const handleGraphWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (currentDataLength <= 0) return;
    e.preventDefault();
    const step = e.deltaY > 0 ? 3 : -3;
    const next = Math.max(0, Math.min(currentDataLength - 1, endIndex + step));
    setManualScrollIndex(next);
    setIsPaused(next < currentDataLength - 1);
  };

  // Helper for Quality Text
  const getQualityText = (stage: string) => {
    if (stage === 'deep') return { text: 'Excellent', color: '#68d391' }; // Green
    if (stage === 'rem') return { text: 'Very Good', color: '#63b3ed' };  // Blue
    if (stage === 'light') return { text: 'Good', color: '#f6ad55' };     // Orange
    return { text: 'Fair', color: '#fc8181' };                            // Red
  };

  if (!selectedSession) {
    return (
      <div className="visualization-panel">
        <div className="no-data-message"><p>No session selected. Start a live acquisition or load a session.</p></div>
      </div>
    );
  }

  // Current stage reflects the last *committed* epoch from the append-only sleepStages array,
  // not the per-sample lookup. This keeps it stable (matches the hypnogram exactly) and
  // prevents flicker as new samples stream in.
  const hasCommittedStages = (selectedSession.sleepStages?.length ?? 0) > 0;
  const currentStage = hasCommittedStages
    ? selectedSession.sleepStages[selectedSession.sleepStages.length - 1].type
    : 'calibrating';

  return (
    <>
    <div className="visualization-panel">
      <div className="panel-header">
        <h2>EEG & Hypnogram</h2>
        <div className="visualization-controls">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={showRawData}
              onChange={(e) => onShowRawDataChange(e.target.checked)}
            />
            Show EEG waveform
          </label>
          {settings.showSleepStages && (
            <button
              type="button"
              className="stage-health-modal-open"
              onClick={() => setStageHealthModalOpen(true)}
            >
              Stages & health
            </button>
          )}
        </div>
      </div>
      
      <div className="visualization-content">
        {edfStreamState.isStreaming ? (
          <div className="sleep-graph">
            <div className="graph-header">
              <h3>{showRawData ? "EEG amplitude (µV)" : "Hypnogram (sleep stage)"}</h3>
              
              <div className="graph-scale" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {(isPaused || isHovering) ? (
                     <span 
                       className="stream-status stream-status-paused"
                       style={{ cursor: isPaused ? 'pointer' : 'default' }}
                       onClick={() => setIsPaused(false)}
                       title={isPaused ? "Click to resume live stream" : ""}
                     >
                       {isPaused ? "Paused (Resume)" : "Paused"}
                     </span>
                  ) : (
                     <span className="stream-status stream-status-live">Live</span>
                  )}
                </div>

                {settings.showSleepStages && (
                  <div className="graph-tooltip-box">
                    {hoverData ? (
                      <div className="graph-tooltip-content">
                         <span className="graph-tooltip-time">{hoverData.time}</span>
                         {showRawData ? (
                           <span className="graph-tooltip-value">
                             Amplitude: {hoverData.value.toFixed(2)} µV
                           </span>
                         ) : (
                           (() => {
                             const q = getQualityText(hoverData.stage);
                             return (
                               <span style={{ color: q.color, fontWeight: '600' }}>
                                 Stage: {hoverData.stage.charAt(0).toUpperCase() + hoverData.stage.slice(1)}
                               </span>
                             );
                           })()
                         )}
                      </div>
                    ) : (
                      <span className="graph-tooltip-default">
                        Current stage: <strong style={{ color: STAGE_COLORS[currentStage], textTransform: 'capitalize' }}>{currentStage}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div 
              className="graph-container" 
              style={{ 
                height: '400px', padding: '1rem', backgroundColor: 'var(--bg-primary)', 
                borderRadius: '8px 8px 0 0', overflow: 'hidden', position: 'relative' 
              }}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => { setHoverData(null); setIsHovering(false); }}
              onWheel={handleGraphWheel}
            >
              {realTimeData.length === 0 ? (
                <div className="graph-empty-state">Acquiring signal…</div>
              ) : (!showRawData && !hasCommittedStages) ? (
                <div className="graph-empty-state">
                  Calibrating sleep stages… (waiting for first 30 s epoch)
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {showRawData ? (
                    // RAW EEG CHART
                    <LineChart 
                      data={realTimeData}
                      margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                      onMouseMove={(e: any) => {
                        if (e.activePayload) setHoverData({ 
                          value: e.activePayload[0].payload.value, 
                          time: e.activePayload[0].payload.timeStr,
                          stage: e.activePayload[0].payload.stage
                        });
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="timeStr" interval={100} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} label={{ value: 'Time (HH:MM:SS)', position: 'insideBottom', offset: -4, fill: 'var(--text-secondary)', fontSize: 10 }} />
                      <YAxis domain={['auto', 'auto']} stroke="var(--text-secondary)" width={42} tick={{ fontSize: 10 }} label={{ value: 'µV', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 10 }} />
                      <Tooltip
                        cursor={{ stroke: 'var(--text-secondary)', strokeWidth: 1 }}
                        contentStyle={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)'
                        }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} µV`, 'Amplitude']}
                        labelFormatter={(label: any) => `Time: ${label}`}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="value" 
                        stroke="#63b3ed" 
                        strokeWidth={1.5} 
                        dot={false} 
                        isAnimationActive={false} 
                      />
                    </LineChart>
                  ) : (
                    // Standard hypnogram: stage bands + step line (one stage per time)
                    <ComposedChart
                      data={realTimeData}
                      margin={{ top: 8, right: 8, left: 8, bottom: 16 }}
                      onMouseMove={(e: any) => {
                        if (e.activePayload && e.activePayload.length > 0) {
                          setHoverData({
                            value: e.activePayload[0].payload.value,
                            time: e.activePayload[0].payload.timeStr,
                            stage: e.activePayload[0].payload.stage
                          });
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="timeStr" interval={100} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} label={{ value: 'Time (HH:MM:SS)', position: 'insideBottom', offset: -4, fill: 'var(--text-secondary)', fontSize: 10 }} />
                      <YAxis
                        type="number"
                        domain={[0.5, 4.5]}
                        ticks={[1, 2, 3, 4]}
                        tickFormatter={(val) => {
                          if (val === 4) return 'Wake';
                          if (val === 3) return 'N1/N2';
                          if (val === 2) return 'REM';
                          if (val === 1) return 'N3';
                          return '';
                        }}
                        stroke="var(--text-secondary)"
                        width={52}
                        tick={{ fontSize: 10, fontWeight: '600', fill: 'var(--text-secondary)' }}
                        label={{ value: 'Stage', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 10 }}
                      />
                      <Tooltip
                        cursor={{ stroke: 'var(--text-primary)', strokeWidth: 2 }}
                        contentStyle={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)'
                        }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                        formatter={(_: any, __: any, item: any) => {
                          const stage = item?.payload?.stage || 'unknown';
                          return [stage.charAt(0).toUpperCase() + stage.slice(1), 'Stage'];
                        }}
                        labelFormatter={(label: any) => `Time: ${label}`}
                      />

                      {/* Horizontal stage bands (background) */}
                      <ReferenceArea y1={0.5} y2={1.5} fill={settings.sleepStageColors['deep']} fillOpacity={0.25} isFront={false} />
                      <ReferenceArea y1={1.5} y2={2.5} fill={settings.sleepStageColors['rem']} fillOpacity={0.25} isFront={false} />
                      <ReferenceArea y1={2.5} y2={3.5} fill={settings.sleepStageColors['light']} fillOpacity={0.25} isFront={false} />
                      <ReferenceArea y1={3.5} y2={4.5} fill={settings.sleepStageColors['awake']} fillOpacity={0.25} isFront={false} />

                      {/* Step line: discrete stage at each time */}
                      <Line
                        type="stepAfter"
                        dataKey="stageLevel"
                        stroke="var(--text-primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: 'var(--text-primary)', stroke: 'var(--bg-primary)', strokeWidth: 1 }}
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>

            <div className="graph-time-scrubber">
              <span className="graph-time-scrubber-label">Window: {LIVE_WINDOW_SAMPLES} samples</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, currentDataLength - 1)}
                value={endIndex}
                onChange={handleSliderChange}
                onMouseDown={() => setIsPaused(true)}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
        ) : (
          <div className="sleep-graph">
            <div className="graph-header">
              <h3>{showRawData ? "EEG amplitude (µV)" : "Hypnogram (sleep stage)"}</h3>
              <div className="graph-scale" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <span className="stream-status stream-status-paused">Review</span>
                {settings.showSleepStages && (
                  <div className="graph-tooltip-box">
                    {hoverData ? (
                      <div className="graph-tooltip-content">
                        <span className="graph-tooltip-time">{hoverData.time}</span>
                        {showRawData ? (
                          <span className="graph-tooltip-value">
                            Amplitude: {hoverData.value.toFixed(2)} µV
                          </span>
                        ) : (
                          (() => {
                            const q = getQualityText(hoverData.stage);
                            return (
                              <span style={{ color: q.color, fontWeight: '600' }}>
                                Stage: {hoverData.stage.charAt(0).toUpperCase() + hoverData.stage.slice(1)}
                              </span>
                            );
                          })()
                        )}
                      </div>
                    ) : (
                      <span className="graph-tooltip-default">
                        Current stage: <strong style={{ color: STAGE_COLORS[currentStage], textTransform: 'capitalize' }}>{currentStage}</strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div
              className="graph-container"
              style={{
                height: '400px', padding: '1rem', backgroundColor: 'var(--bg-primary)',
                borderRadius: '8px 8px 0 0', overflow: 'hidden', position: 'relative'
              }}
              onMouseEnter={() => setIsHovering(true)}
              onMouseLeave={() => { setHoverData(null); setIsHovering(false); }}
              onWheel={handleGraphWheel}
            >
              {realTimeData.length === 0 ? (
                <div className="graph-empty-state">No signal samples in this session.</div>
              ) : (!showRawData && !hasCommittedStages) ? (
                <div className="graph-empty-state">
                  No sleep stage data available for this session.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {showRawData ? (
                    <LineChart
                      data={realTimeData}
                      margin={{ top: 8, right: 8, left: 8, bottom: 8 }}
                      onMouseMove={(e: any) => {
                        if (e.activePayload) setHoverData({
                          value: e.activePayload[0].payload.value,
                          time: e.activePayload[0].payload.timeStr,
                          stage: e.activePayload[0].payload.stage
                        });
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" />
                      <XAxis dataKey="timeStr" interval={100} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} label={{ value: 'Time (HH:MM:SS)', position: 'insideBottom', offset: -4, fill: 'var(--text-secondary)', fontSize: 10 }} />
                      <YAxis domain={['auto', 'auto']} stroke="var(--text-secondary)" width={42} tick={{ fontSize: 10 }} label={{ value: 'µV', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 10 }} />
                      <Tooltip
                        cursor={{ stroke: 'var(--text-secondary)', strokeWidth: 1 }}
                        contentStyle={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)'
                        }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                        formatter={(value: any) => [`${Number(value).toFixed(2)} µV`, 'Amplitude']}
                        labelFormatter={(label: any) => `Time: ${label}`}
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="#63b3ed"
                        strokeWidth={1.5}
                        dot={false}
                        isAnimationActive={false}
                      />
                    </LineChart>
                  ) : (
                    <ComposedChart
                      data={realTimeData}
                      margin={{ top: 8, right: 8, left: 8, bottom: 16 }}
                      onMouseMove={(e: any) => {
                        if (e.activePayload && e.activePayload.length > 0) {
                          setHoverData({
                            value: e.activePayload[0].payload.value,
                            time: e.activePayload[0].payload.timeStr,
                            stage: e.activePayload[0].payload.stage
                          });
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
                      <XAxis dataKey="timeStr" interval={100} tick={{ fill: 'var(--text-secondary)', fontSize: 10 }} label={{ value: 'Time (HH:MM:SS)', position: 'insideBottom', offset: -4, fill: 'var(--text-secondary)', fontSize: 10 }} />
                      <YAxis
                        type="number"
                        domain={[0.5, 4.5]}
                        ticks={[1, 2, 3, 4]}
                        tickFormatter={(val) => {
                          if (val === 4) return 'Wake';
                          if (val === 3) return 'N1/N2';
                          if (val === 2) return 'REM';
                          if (val === 1) return 'N3';
                          return '';
                        }}
                        stroke="var(--text-secondary)"
                        width={52}
                        tick={{ fontSize: 10, fontWeight: '600', fill: 'var(--text-secondary)' }}
                        label={{ value: 'Stage', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)', fontSize: 10 }}
                      />
                      <Tooltip
                        cursor={{ stroke: 'var(--text-primary)', strokeWidth: 2 }}
                        contentStyle={{
                          backgroundColor: 'var(--bg-secondary)',
                          border: '1px solid var(--border-color)',
                          borderRadius: '6px',
                          color: 'var(--text-primary)'
                        }}
                        labelStyle={{ color: 'var(--text-secondary)' }}
                        formatter={(_: any, __: any, item: any) => {
                          const stage = item?.payload?.stage || 'unknown';
                          return [stage.charAt(0).toUpperCase() + stage.slice(1), 'Stage'];
                        }}
                        labelFormatter={(label: any) => `Time: ${label}`}
                      />
                      <ReferenceArea y1={0.5} y2={1.5} fill={settings.sleepStageColors['deep']} fillOpacity={0.25} isFront={false} />
                      <ReferenceArea y1={1.5} y2={2.5} fill={settings.sleepStageColors['rem']} fillOpacity={0.25} isFront={false} />
                      <ReferenceArea y1={2.5} y2={3.5} fill={settings.sleepStageColors['light']} fillOpacity={0.25} isFront={false} />
                      <ReferenceArea y1={3.5} y2={4.5} fill={settings.sleepStageColors['awake']} fillOpacity={0.25} isFront={false} />
                      <Line
                        type="stepAfter"
                        dataKey="stageLevel"
                        stroke="var(--text-primary)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: 'var(--text-primary)', stroke: 'var(--bg-primary)', strokeWidth: 1 }}
                        isAnimationActive={false}
                        connectNulls={false}
                      />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>

            <div className="graph-time-scrubber">
              <span className="graph-time-scrubber-label">Window: {LIVE_WINDOW_SAMPLES} samples</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, currentDataLength - 1)}
                value={endIndex}
                onChange={handleSliderChange}
                onMouseDown={() => setIsPaused(true)}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
    <SleepStageHealthModal open={stageHealthModalOpen} onClose={() => setStageHealthModalOpen(false)} />
    </>
  );
};

export default VisualizationPanel;