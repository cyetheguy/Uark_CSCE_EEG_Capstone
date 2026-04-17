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
  notifications: boolean;
  defaultDevice: string;
  exportFolder: string;
  sleepStageColors: Record<string, string>;
  showSleepStages: boolean;
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
  /** Per-stage overlap with the recording window, in minutes (not hours). */
  stageDurations: Record<string, number>;
  efficiency: string;
  numCycles: number;
  /** Recording minutes in [first, last] plot timestamp not covered by any stage overlap (see useSleepData). */
  unscoredMinutes?: number;
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
  // Removed livePlotImage and edfPlotUrl
  plotError?: string;
}