import React, { useState, useMemo } from 'react';
import EEGChart from './EEGChart';
import { SleepSessionData, AppSettings, ChartDataPoint, EDFStreamState } from '../types';
import { 
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, 
  CartesianGrid, Area, ComposedChart 
} from 'recharts';

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
  onShowRawDataChange: onShowRawDataChangeProp, 
  onTimeViewChange,
  onSelectedSleepStageChange,
  getChartData
}) => {
  const [hoverData, setHoverData] = useState<{ value: number; time: string; stage: string } | null>(null);
  const [isInteracting, setIsInteracting] = useState(false);
  const [manualScrollIndex, setManualScrollIndex] = useState<number>(0);
  
  const WINDOW_SIZE = 500;
  const currentDataLength = selectedSession?.channelData.length || 0;
  
  const startIndex = useMemo(() => {
    if (currentDataLength === 0) return 0;
    if (isInteracting) {
      return Math.min(Math.max(0, manualScrollIndex), Math.max(0, currentDataLength - WINDOW_SIZE));
    }
    return Math.max(0, currentDataLength - WINDOW_SIZE);
  }, [isInteracting, manualScrollIndex, currentDataLength]);

  const realTimeData = useMemo(() => {
    if (!selectedSession || currentDataLength === 0) return [];
    
    const sliceData = selectedSession.channelData.slice(startIndex, startIndex + WINDOW_SIZE);
    const sliceTimestamps = selectedSession.timestamps.slice(startIndex, startIndex + WINDOW_SIZE);
    
    let previousSmoothedValue = 4; // Default to Awake
    if (startIndex > 0) {
       const prevTs = selectedSession.timestamps[startIndex - 1];
       const prevStage = getSleepStageAtTime(selectedSession.sleepStages, prevTs);
       previousSmoothedValue = STAGE_TARGETS[prevStage] ?? 4;
    }

    const smoothedData = [];
    let currentVal = previousSmoothedValue;
    const SMOOTHING_FACTOR = 0.05; 

    for (let i = 0; i < sliceData.length; i++) {
      const ts = sliceTimestamps[i];
      const stage = getSleepStageAtTime(selectedSession.sleepStages, ts);
      const targetVal = STAGE_TARGETS[stage] ?? 1;

      // 1. Calculate the smoothed total height
      currentVal = currentVal + (targetVal - currentVal) * SMOOTHING_FACTOR;

      // 2. Split this total height into stacked components
      const deepPart = Math.min(Math.max(currentVal - 0, 0), 1);
      const remPart = Math.min(Math.max(currentVal - 1, 0), 1);
      const lightPart = Math.min(Math.max(currentVal - 2, 0), 1);
      const awakePart = Math.min(Math.max(currentVal - 3, 0), 1);

      smoothedData.push({
        index: startIndex + i,
        value: sliceData[i][0],
        stage: stage,
        stageValue: currentVal, // Added this back for the invisible line tracker
        
        deepVal: deepPart,
        remVal: remPart,
        lightVal: lightPart,
        awakeVal: awakePart,
        
        timeStr: ts.toLocaleTimeString('en-US', {
          hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit'
        }) + `.${Math.floor(ts.getMilliseconds() / 100)}`
      });
    }

    return smoothedData;
  }, [selectedSession, startIndex, currentDataLength, getSleepStageAtTime]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsInteracting(true);
    setManualScrollIndex(parseInt(e.target.value));
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
        <div className="no-data-message"><p>No sleep session selected.</p></div>
      </div>
    );
  }

  const currentStage = realTimeData.length > 0 ? realTimeData[realTimeData.length - 1].stage : 'unknown';

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
        </div>
      </div>
      
      <div className="visualization-content">
        {edfStreamState.isStreaming ? (
          <div className="sleep-graph">
            <div className="graph-header">
              <h3>{showRawData ? "Real-time EEG Amplitude" : "Real-time Sleep Hypnogram"}</h3>
              
              <div className="graph-scale" style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {isInteracting ? (
                     <span style={{ color: '#f6e05e', fontWeight: 'bold', fontSize: '0.9em' }}>⏸ PAUSED</span>
                  ) : (
                     <span style={{ color: '#fc8181', fontWeight: 'bold', fontSize: '0.9em' }}>🔴 LIVE</span>
                  )}
                </div>

                <div style={{ 
                  backgroundColor: '#2d3748', padding: '4px 12px', borderRadius: '4px', 
                  fontSize: '0.85rem', border: '1px solid #4a5568', minWidth: '280px', textAlign: 'center'
                }}>
                  {hoverData ? (
                    <div style={{ display: 'flex', flexDirection: 'column', lineHeight: '1.2' }}>
                       <span style={{ color: '#e2e8f0', fontSize: '0.8em', marginBottom: '2px' }}>
                         {hoverData.time}
                       </span>
                       {showRawData ? (
                         <span style={{ color: '#63b3ed', fontWeight: 'bold' }}>
                           Raw Val: {hoverData.value.toFixed(2)} µV
                         </span>
                       ) : (
                         /* SHOW SLEEP QUALITY ON HOVER */
                         (() => {
                           const q = getQualityText(hoverData.stage);
                           return (
                             <span style={{ color: q.color, fontWeight: 'bold' }}>
                               Quality: {q.text} ({hoverData.stage})
                             </span>
                           );
                         })()
                       )}
                    </div>
                  ) : (
                    <span style={{ color: '#a0aec0' }}>
                      Current: <strong style={{ color: STAGE_COLORS[currentStage], textTransform: 'capitalize' }}>{currentStage}</strong>
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            <div 
              className="graph-container" 
              style={{ 
                height: '400px', padding: '1rem', backgroundColor: '#1a202c', 
                borderRadius: '8px 8px 0 0', overflow: 'hidden', position: 'relative' 
              }}
              onMouseEnter={() => setIsInteracting(true)}
              onMouseLeave={() => { setHoverData(null); setIsInteracting(false); }}
            >
              {realTimeData.length === 0 ? (
                <div style={{ color: '#cbd5e0', textAlign: 'center', marginTop: '150px' }}>Waiting for data stream...</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  {showRawData ? (
                    // RAW EEG CHART
                    <LineChart 
                      data={realTimeData}
                      onMouseMove={(e: any) => {
                        if (e.activePayload) setHoverData({ 
                          value: e.activePayload[0].payload.value, 
                          time: e.activePayload[0].payload.timeStr,
                          stage: e.activePayload[0].payload.stage
                        });
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" />
                      <XAxis dataKey="timeStr" interval={100} tick={{ fill: '#718096', fontSize: 10 }} />
                      <YAxis domain={['auto', 'auto']} stroke="#718096" width={35} tick={{ fontSize: 10 }} />
                      <Tooltip content={() => null} cursor={{ stroke: '#a0aec0', strokeWidth: 1 }} />
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
                    // STACKED AREA CHART WITH SINGLE TRACKER DOT
                    <ComposedChart
                      data={realTimeData}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                      onMouseMove={(e: any) => {
                        if (e.activePayload && e.activePayload.length > 0) {
                          setHoverData({ 
                            value: e.activePayload[0].payload.value, // FIXED: Now reading from payload
                            time: e.activePayload[0].payload.timeStr,
                            stage: e.activePayload[0].payload.stage
                          });
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                      <XAxis dataKey="timeStr" interval={100} tick={{ fill: '#718096', fontSize: 10 }} />
                      
                      <YAxis 
                        type="number" 
                        domain={[0, 4]} 
                        ticks={[1, 2, 3, 4]}
                        tickFormatter={(val) => {
                          if (val === 4) return 'Awake';
                          if (val === 3) return 'Light';
                          if (val === 2) return 'REM';
                          if (val === 1) return 'Deep';
                          return '';
                        }}
                        stroke="#718096" 
                        width={50}
                        tick={{ fontSize: 11, fontWeight: 'bold' }}
                      />
                      
                      <Tooltip content={() => null} cursor={{ stroke: 'white', strokeWidth: 2 }} />

                      {/* 1. Deep (Green) */}
                      <Area
                        type="monotone" dataKey="deepVal" stackId="1" 
                        stroke="none" fill={STAGE_COLORS.deep} fillOpacity={0.8}
                        isAnimationActive={false} activeDot={false}
                      />
                      
                      {/* 2. REM (Blue) */}
                      <Area
                        type="monotone" dataKey="remVal" stackId="1"
                        stroke="none" fill={STAGE_COLORS.rem} fillOpacity={0.8}
                        isAnimationActive={false} activeDot={false}
                      />
                      
                      {/* 3. Light (Orange) */}
                      <Area
                        type="monotone" dataKey="lightVal" stackId="1"
                        stroke="none" fill={STAGE_COLORS.light} fillOpacity={0.8}
                        isAnimationActive={false} activeDot={false}
                      />
                      
                      {/* 4. Awake (Red) */}
                      <Area
                        type="monotone" dataKey="awakeVal" stackId="1"
                        stroke="none" fill={STAGE_COLORS.awake} fillOpacity={0.8}
                        isAnimationActive={false} activeDot={false}
                      />

                      {/* 5. INVISIBLE LINE FOR SINGLE TRACKER DOT */}
                      <Line
                        type="monotone"
                        dataKey="stageValue"
                        stroke="none"
                        dot={false}
                        activeDot={{ r: 5, fill: 'white', strokeWidth: 0 }}
                        isAnimationActive={false}
                      />
                    </ComposedChart>
                  )}
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ 
              backgroundColor: '#2d3748', padding: '10px 15px', 
              borderRadius: '0 0 8px 8px', borderTop: '1px solid #4a5568',
              display: 'flex', alignItems: 'center', gap: '10px'
            }}>
              <span style={{ fontSize: '0.8em', color: '#a0aec0' }}>History:</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, currentDataLength - WINDOW_SIZE)}
                value={startIndex}
                onChange={handleSliderChange}
                onMouseDown={() => setIsInteracting(true)}
                style={{ width: '100%', cursor: 'pointer' }}
              />
            </div>
          </div>
        ) : (
          <div className="sleep-graph">
             <div className="graph-container">
               <EEGChart
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
             </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default VisualizationPanel;