// EEGChart.tsx
import React from 'react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceArea,
  Area,
  AreaChart
} from 'recharts';

interface SleepStage {
  type: 'awake' | 'light' | 'deep' | 'rem';
  startTime: Date;
  endTime: Date;
  duration: number;
}

interface EEGChartData {
  timestamp: Date;
  value: number;
  channel: number;
  deviceId: string;
  quality: string;
  sleepStage?: string;
}

interface EEGChartProps {
  data: EEGChartData[];
  channel: number;
  height?: number;
  timeRange?: number;
  color?: string;
  showStats?: boolean;
  sleepStages?: SleepStage[];
  showSleepStages?: boolean;
  yAxisRange?: number;
  chartType?: 'line' | 'area' | 'waveform';
}

const EEGChart: React.FC<EEGChartProps> = ({ 
  data, 
  channel, 
  height = 300,
  timeRange = 28800, // 8 hours in seconds
  color = '#38a169',
  showStats = true,
  sleepStages = [],
  showSleepStages = true,
  yAxisRange = 100,
  chartType = 'waveform'
}) => {
  if (!data || data.length === 0) {
    return (
      <div style={{
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--bg-primary)',
        borderRadius: '8px',
        border: '1px solid var(--border-color)',
        color: 'var(--text-secondary)',
        fontStyle: 'italic'
      }}>
        No EEG sleep data available
      </div>
    );
  }

  // Format data for Recharts
  const chartData = data.map(d => ({
    time: d.timestamp,
    hours: (d.timestamp.getTime() - data[0].timestamp.getTime()) / (60 * 60 * 1000),
    timestampStr: d.timestamp.toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit'
    }),
    value: d.value,
    sleepStage: d.sleepStage,
    quality: d.quality,
    deviceId: d.deviceId
  }));

  // Calculate statistics for entire sleep session
  const values = chartData.map(d => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const std = Math.sqrt(values.reduce((sq, n) => sq + Math.pow(n - avg, 2), 0) / values.length);

  // Get sleep stage statistics
  const stageStats = sleepStages.reduce((acc, stage) => {
    const stageData = data.filter(d => 
      d.timestamp >= stage.startTime && d.timestamp <= stage.endTime
    );
    const stageValues = stageData.map(d => d.value);
    if (stageValues.length > 0) {
      acc[stage.type] = {
        avg: stageValues.reduce((a, b) => a + b, 0) / stageValues.length,
        min: Math.min(...stageValues),
        max: Math.max(...stageValues)
      };
    }
    return acc;
  }, {} as Record<string, { avg: number; min: number; max: number }>);

  // Format tooltip
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      const hour = Math.floor(data.hours);
      const minute = Math.floor((data.hours - hour) * 60);
      
      return (
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: '4px',
          padding: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          maxWidth: '300px'
        }}>
          <p style={{ margin: 0, fontWeight: 'bold', color: color }}>
            Sleep Hour {hour}:{minute.toString().padStart(2, '0')}
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.9em', color: 'var(--text-primary)' }}>
            <strong>EEG Amplitude:</strong> {data.value.toFixed(2)} µV
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.9em', color: 'var(--text-primary)' }}>
            <strong>Sleep Stage:</strong> {data.sleepStage || 'Unknown'}
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.9em', color: 'var(--text-primary)' }}>
            <strong>Time:</strong> {data.timestampStr}
          </p>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.9em', color: 'var(--text-primary)' }}>
            <strong>Signal Quality:</strong> {data.quality}
          </p>
        </div>
      );
    }
    return null;
  };

  // Create sleep stage background areas
  const getSleepStageAreas = () => {
    if (!showSleepStages || !sleepStages.length) return null;

    return sleepStages.map((stage, index) => {
      const startHour = (stage.startTime.getTime() - data[0].timestamp.getTime()) / (60 * 60 * 1000);
      const endHour = (stage.endTime.getTime() - data[0].timestamp.getTime()) / (60 * 60 * 1000);
      
      return (
        <ReferenceArea
          key={index}
          x1={startHour}
          x2={endHour}
          stroke="transparent"
          fill={getStageColor(stage.type)}
          fillOpacity={0.1}
          ifOverflow="extendDomain"
        />
      );
    });
  };

  const getStageColor = (stage: string) => {
    const colors: Record<string, string> = {
      awake: '#e53e3e',
      light: '#ed8936',
      deep: '#38a169',
      rem: '#667eea'
    };
    return colors[stage] || '#718096';
  };

  return (
    <div style={{ height: `${height}px`, width: '100%' }}>
      {showStats && (
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '10px',
          padding: '8px 12px',
          backgroundColor: 'var(--bg-primary)',
          borderRadius: '6px',
          border: '1px solid var(--border-color)',
          fontSize: '0.85em',
          flexWrap: 'wrap',
          gap: '10px'
        }}>
          <div>
            <span style={{ color: 'var(--text-secondary)', marginRight: '8px' }}>
              Sleep EEG - {data.length.toLocaleString()} samples
            </span>
            <span style={{ color: color, fontWeight: 'bold' }}>
              {((data[data.length - 1]?.timestamp.getTime() - data[0]?.timestamp.getTime()) / (60 * 60 * 1000)).toFixed(1)} hours
            </span>
          </div>
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            <div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>Range: </span>
              <span style={{ color: '#007bff', fontWeight: 'bold' }}>±{yAxisRange} µV</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>Min: </span>
              <span style={{ color: '#dc3545', fontWeight: 'bold' }}>{min.toFixed(2)} µV</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>Avg: </span>
              <span style={{ color: '#28a745', fontWeight: 'bold' }}>{avg.toFixed(2)} µV</span>
            </div>
            <div>
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9em' }}>Max: </span>
              <span style={{ color: '#007bff', fontWeight: 'bold' }}>{max.toFixed(2)} µV</span>
            </div>
          </div>
        </div>
      )}
      
      {/* <ResponsiveContainer width="100%" height={showStats ? 'calc(100% - 50px)' : '100%'}> */}
      <ResponsiveContainer width="100%">

        {chartType === 'area' ? (
          <AreaChart data={chartData}>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="var(--border-color)" 
              strokeOpacity={0.3}
            />
            <XAxis 
              dataKey="hours"
              stroke="var(--text-secondary)"
              tick={{ fontSize: 11 }}
              label={{ 
                value: 'Sleep Hours', 
                position: 'insideBottom',
                offset: -5,
                style: { fill: 'var(--text-primary)', fontSize: 12 }
              }}
              tickFormatter={(value) => `${value.toFixed(1)}h`}
            />
            <YAxis 
              stroke="var(--text-secondary)"
              tick={{ fontSize: 11 }}
              domain={[-yAxisRange, yAxisRange]}
              label={{ 
                value: 'Amplitude (µV)', 
                angle: -90, 
                position: 'insideLeft',
                offset: -10,
                style: { fill: 'var(--text-primary)', fontSize: 12 }
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {getSleepStageAreas()}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={1}
              fill={color}
              fillOpacity={0.3}
              activeDot={{ r: 4 }}
              name="EEG Amplitude"
            />
          </AreaChart>
        ) : (
          <LineChart data={chartData}>
            <CartesianGrid 
              strokeDasharray="3 3" 
              stroke="var(--border-color)" 
              strokeOpacity={0.3}
            />
            <XAxis 
              dataKey="hours"
              stroke="var(--text-secondary)"
              tick={{ fontSize: 11 }}
              label={{ 
                value: 'Sleep Hours', 
                position: 'insideBottom',
                offset: -5,
                style: { fill: 'var(--text-primary)', fontSize: 12 }
              }}
              tickFormatter={(value) => `${value.toFixed(1)}h`}
            />
            <YAxis 
              stroke="var(--text-secondary)"
              tick={{ fontSize: 11 }}
              domain={[-yAxisRange, yAxisRange]}
              label={{ 
                value: 'Amplitude (µV)', 
                angle: -90, 
                position: 'insideLeft',
                offset: -10,
                style: { fill: 'var(--text-primary)', fontSize: 12 }
              }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {getSleepStageAreas()}
            
            {/* Main EEG signal line */}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={chartType === 'waveform' ? 1 : 2}
              dot={false}
              activeDot={{ 
                r: 4, 
                stroke: 'white', 
                strokeWidth: 2,
                fill: color 
              }}
              name="EEG Signal"
              isAnimationActive={true}
              animationDuration={1000}
              animationEasing="ease-in-out"
            />
            
            {/* Moving average for better visualization */}
            {chartType === 'waveform' && (
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={0.5}
                strokeOpacity={0.5}
                dot={false}
                name="Smoothed"
                isAnimationActive={false}
              />
            )}
          </LineChart>
        )}
      </ResponsiveContainer>
      
      {/* Sleep stage legend */}
      {showSleepStages && sleepStages.length > 0 && (
        <div style={{
          marginTop: '8px',
          display: 'flex',
          justifyContent: 'center',
          gap: '20px',
          flexWrap: 'wrap'
        }}>
          {Array.from(new Set(sleepStages.map(s => s.type))).map(stage => (
            <div key={stage} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: getStageColor(stage),
                borderRadius: '2px'
              }}></div>
              <span style={{ fontSize: '0.8em', color: 'var(--text-secondary)' }}>
                {stage.charAt(0).toUpperCase() + stage.slice(1)} Sleep
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EEGChart;