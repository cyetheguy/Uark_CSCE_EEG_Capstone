export interface SleepSessionData {
  id: string;
  startTime: Date;
  endTime: Date;
  deviceId: string;
  channelData: number[][];
  timestamps: Date[];
  sleepStages: SleepStage[];
  quality: 'good' | 'fair' | 'poor';
  sessionType: 'night' | 'nap' | 'baseline';
}

export interface SleepStage {
  type: 'awake' | 'light' | 'deep' | 'rem';
  startTime: Date;
  endTime: Date;
  duration: number;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'auto';
  timeFormat: '12h' | '24h';
  notifications: boolean;
  autoLoadDemoData: boolean;
  dataRetention: number;
  chartType: 'line' | 'area' | 'waveform';
  defaultDevice: string;
  sleepStageColors: Record<string, string>;
  showSleepStages: boolean;
  showBaseline: boolean;
  yAxisRange: number;
}

export interface SessionMetadata {
  id: string;
  startTime: string;
  endTime: string;
  deviceId: string;
  date: string;
  hourRange: string;
}

export interface SleepStats {
  totalDuration: string;
  stageDurations: Record<string, number>;
  efficiency: string;
  numCycles: number;
}

export interface ChartDataPoint {
  timestamp: Date;
  value: number;
  channel: number;
  deviceId: string;
  quality: string;
  sleepStage: string;
}

export interface EDFStreamState {
  isStreaming: boolean;
  livePlotImage: string;
  edfPlotUrl: string;
}