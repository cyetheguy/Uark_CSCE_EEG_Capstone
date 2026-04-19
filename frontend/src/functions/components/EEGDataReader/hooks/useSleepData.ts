import { useState, useCallback, useRef } from 'react';
import { SleepSessionData, SleepStage, SessionMetadata, SleepStats, EDFStreamState } from '../types';
import {
  computeLabelsFromAmplitude,
  labelsToSegments,
  EPOCH_SEC,
} from '../utils/sleepStagesFromAmplitude';

/**
 * Central "model" hook for the EEGDataReader UI.
 *
 * Responsibilities:
 * - **Live mode**: connect to backend SSE (`/api/edf/stream?mode=live`) and incrementally append samples
 * - **Review mode**: list and load sessions from backend (`/api/sessions/list`, `/api/sessions/:id/data`)
 * - **Staging**: periodically recompute amplitude-only sleep stages from the growing raw buffer
 * - **Stats**: compute user-facing summary numbers from stage segments
 *
 * Design notes:
 * - The UI plot is intentionally *downsampled* to ~1 point/sec (to keep React/Recharts smooth).
 * - The sleep-stage algorithm needs *raw-ish* dynamics, so we keep a separate `rawValues` array at the
 *   backend sampling rate and only stage when we have at least one full 30s epoch.
 */
export const useSleepData = () => {
  const [sleepSessions, setSleepSessions] = useState<SleepSessionData[]>([]);
  const [selectedSession, setSelectedSession] = useState<SleepSessionData | null>(null);
  const [sessionList, setSessionList] = useState<SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  
  const [edfStreamState, setEdfStreamState] = useState<EDFStreamState>({
    isStreaming: false,
    plotError: ''
  });
  
  const edfEventSourceRef = useRef<EventSource | null>(null);
  const liveStreamSfreqRef = useRef(250);
  const lastStageRecomputeMsRef = useRef(0);

  // When false the live stream still accumulates data but does not touch selectedSession,
  // allowing review-mode session selection to remain undisturbed.
  const liveUpdateSelectedRef = useRef(true);

  // Throttle staging recomputation: recomputing on every incoming sample would be expensive.
  const STAGE_RECOMPUTE_MS = 2000;

  // Append-only hypnogram: once an epoch's label is committed here, it is NEVER changed.
  // This prevents the percentile-based staging algorithm from retroactively relabeling
  // past epochs every time a new one arrives (which previously caused the whole hypnogram
  // to flicker between stages).
  const committedLabelsRef = useRef<number[]>([]);
  const committedEpochsRef = useRef(0);
  // Commit from the first complete epoch so live hypnogram updates every epoch (30 s).
  const CALIBRATION_EPOCHS = 1;

  // AASM standard: one stage per 30-second epoch. Demo data still uses synthetic cycling below.
  const generateMockSleepStages = useCallback((start: Date, end: Date, isLiveDemo: boolean = false): SleepStage[] => {
    const durationMs = end.getTime() - start.getTime();
    const stages: SleepStage[] = [];

    if (isLiveDemo) {
      // Epoch-based (30 s), realistic progression: Wake → N1/N2 → N3 → N2 → REM, with runs lasting minutes
      const epochMs = EPOCH_SEC * 1000;
      // Run lengths in number of 30s epochs (so 4 = 2 min, 10 = 5 min). No Wake→REM; must go through light/deep.
      const sequence: Array<{ type: SleepStage['type']; epochs: number }> = [
        { type: 'awake', epochs: 4 },      // ~2 min wake
        { type: 'light', epochs: 12 },      // ~6 min N1/N2
        { type: 'deep', epochs: 8 },       // ~4 min N3
        { type: 'light', epochs: 6 },      // ~3 min N2
        { type: 'rem', epochs: 10 },       // ~5 min REM
        { type: 'light', epochs: 8 },
        { type: 'deep', epochs: 6 },
        { type: 'light', epochs: 6 },
        { type: 'rem', epochs: 12 },
        { type: 'light', epochs: 10 },
        { type: 'deep', epochs: 6 },
        { type: 'light', epochs: 4 },
      ];
      let currentTime = start.getTime();
      let seqIndex = 0;
      while (currentTime < end.getTime()) {
        const { type, epochs } = sequence[seqIndex % sequence.length];
        const runEpochs = Math.min(epochs, Math.ceil((end.getTime() - currentTime) / epochMs));
        if (runEpochs <= 0) break;
        const stageEnd = currentTime + runEpochs * epochMs;
        stages.push({
          type,
          startTime: new Date(currentTime),
          endTime: new Date(stageEnd),
          duration: (runEpochs * EPOCH_SEC) / 60
        });
        currentTime = stageEnd;
        seqIndex++;
      }
    } else {
      // NORMAL REALISTIC CYCLING for Historical Data
      const stageSequence: Array<{type: SleepStage['type'], duration: number}> = [
        { type: 'awake', duration: 0.1 }, 
        { type: 'light', duration: 0.3 },
        { type: 'deep', duration: 0.25 }, 
        { type: 'light', duration: 0.15 },
        { type: 'rem', duration: 0.2 },
      ];
      let currentTime = start.getTime();
      const numCycles = 4 + Math.floor(Math.random() * 2);
      
      for (let cycle = 0; cycle < numCycles; cycle++) {
        for (const stage of stageSequence) {
          const stageDuration = (durationMs / numCycles) * stage.duration;
          const stageEnd = currentTime + stageDuration;
          
          stages.push({
            type: stage.type,
            startTime: new Date(currentTime),
            endTime: new Date(stageEnd),
            duration: stageDuration / (60 * 1000)
          });
          
          currentTime = stageEnd;
          if (currentTime >= end.getTime()) break;
        }
        if (currentTime >= end.getTime()) break;
      }
    }
    
    return stages;
  }, []);

  const getSleepStageAtTime = useCallback((stages: SleepStage[], time: Date): SleepStage['type'] => {
    const timeMs = time.getTime();
    const stage = stages.find(s => 
      timeMs >= s.startTime.getTime() && timeMs < s.endTime.getTime() // changed <= to < to avoid overlap
    );
    return stage ? stage.type : 'awake';
  }, []);

  const loadDemoSleepData = useCallback((sessionId?: string) => {
    setIsLoading(true);
    setTimeout(() => {
      const now = new Date();
      const lastNight = new Date(now);
      lastNight.setDate(lastNight.getDate() - 1);
      lastNight.setHours(22, 0, 0, 0);
      const sessionEnd = new Date(lastNight);
      sessionEnd.setHours(sessionEnd.getHours() + 8);
      const mockSession: SleepSessionData = {
        id: sessionId || `demo_session_${Date.now()}`,
        startTime: lastNight,
        endTime: sessionEnd,
        deviceId: 'EEG_Sleep_Device_01',
        timestamps: [],
        channelData: [],
        sleepStages: generateMockSleepStages(lastNight, sessionEnd, false),
        quality: 'good',
        sessionType: 'night'
      };
      
      const numSamples = 1000;
      for (let i = 0; i < numSamples; i++) {
        mockSession.timestamps.push(new Date(lastNight.getTime() + i * 1000));
        mockSession.channelData.push([Math.sin(i * 0.1) * 20]);
      }
      setSleepSessions(prev => [...prev.filter(s => s.id !== mockSession.id), mockSession]);
      setSelectedSession(mockSession);
      setIsLoading(false);
    }, 1000);
  }, [generateMockSleepStages]);

  const isStreamActive = useCallback((): boolean => {
    return edfEventSourceRef.current !== null && edfEventSourceRef.current.readyState !== EventSource.CLOSED;
  }, []);

  const loadEDFPlot = useCallback(async (username: string = 'demo', mode: 'live' | 'review' = 'live') => {
    if (isStreamActive()) {
      console.log('Live stream already active — skipping duplicate loadEDFPlot');
      return;
    }
    setIsLoading(true);
    const modeParam = mode === 'live' ? 'live' : 'review';
    console.log(`Initializing stream (mode=${modeParam})...`);

    try {
      // Ask backend which file/source we are streaming and what sampling rate to assume.
      // Live mode returns 250 Hz (firmware TX_PERIOD_MS=4); review reads from EDF metadata.
      const infoResponse = await fetch(`/api/edf/info?username=${encodeURIComponent(username)}&mode=${modeParam}`);
      const infoData = await infoResponse.json();
      
      if (!infoData.success) {
        console.error("Failed to fetch EDF info:", infoData.error);
        setEdfStreamState(prev => ({ ...prev, plotError: infoData.error || 'Failed to load file' }));
        setIsLoading(false);
        return;
      }

      liveStreamSfreqRef.current = typeof infoData.sampling_rate === 'number' ? infoData.sampling_rate : 250;
      lastStageRecomputeMsRef.current = 0;
      committedLabelsRef.current = [];
      committedEpochsRef.current = 0;
      
      const now = new Date();
      const sessionStart = new Date(now);
      sessionStart.setHours(22, 0, 0, 0);
      // Live streams don't have an inherent wall-clock start time, so we anchor the display to
      // a synthetic "10pm last night" for consistent charts/stats UI.
      
      const streamSession: SleepSessionData = {
        id: `edf_stream_${Date.now()}`,
        startTime: sessionStart,
        endTime: new Date(sessionStart.getTime() + 8 * 60 * 60 * 1000),
        deviceId: `🔴 LIVE: ${infoData.filename}`,
        timestamps: [],
        channelData: [],
        sleepStages: [],
        quality: 'good',
        sessionType: 'night'
      };
      
      setSleepSessions([streamSession]);
      setSelectedSession(streamSession);
      setEdfStreamState(prev => ({ ...prev, isStreaming: true, plotError: '' }));
      
      if (edfEventSourceRef.current) {
        edfEventSourceRef.current.close();
      }

      // Backend emits Server-Sent Events (SSE) packets:
      //   data: {"value": <number>, "timestamp": <sec_since_stream_start>, "sample": <index>}
      const streamUrl = `/api/edf/stream?mode=${modeParam}`;
      console.log("Connecting to EventSource:", streamUrl);
      const eventSource = new EventSource(streamUrl);
      edfEventSourceRef.current = eventSource;
      
      let sampleCount = 0;
      const rawValues: number[] = [];
      let streamTimestampOffsetSec: number | null = null;
      let lastReactUpdateMs = 0;
      const REACT_UPDATE_INTERVAL_MS = 66; // ~15 Hz React state updates
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.error) {
            console.error('Stream backend error:', data.error);
            eventSource.close();
            setEdfStreamState(prev => ({ ...prev, isStreaming: false, plotError: data.error }));
            return;
          }
          
          // Some backends start SSE timestamps at a non-zero value. Normalize so the
          // first sample in this stream is always t=0; otherwise the first committed
          // 30 s epoch can appear as a partial slice (e.g., 16 s) in Sleep summary.
          if (streamTimestampOffsetSec === null) {
            streamTimestampOffsetSec = typeof data.timestamp === 'number' ? data.timestamp : 0;
          }
          const normalizedTimestampSec = Math.max(
            0,
            (typeof data.timestamp === 'number' ? data.timestamp : 0) - streamTimestampOffsetSec
          );
          const timestamp = new Date(sessionStart.getTime() + normalizedTimestampSec * 1000);
          rawValues.push(data.value);

          streamSession.timestamps.push(timestamp);
          streamSession.channelData.push([data.value]);

          // Derive the actual sampling rate from observed data rather than the
          // backend-reported value. The BLE/SSE pipeline may deliver far fewer
          // samples/sec than the firmware's nominal 250 SPS.
          const elapsedSec = (timestamp.getTime() - sessionStart.getTime()) / 1000;
          const observedSf = elapsedSec > 1 ? rawValues.length / elapsedSec : liveStreamSfreqRef.current;

          // Append-only staging: past epochs never get relabeled. We only run the algorithm
          // often enough to classify newly-completed epochs, and we never overwrite older
          // committed labels. This keeps the hypnogram, the sleep summary, and the current
          // stage indicator all stable across time.
          const epochSamples = Math.max(1, Math.round(EPOCH_SEC * observedSf));
          const totalCompletedEpochs = Math.floor(rawValues.length / epochSamples);

          if (committedEpochsRef.current === 0 && totalCompletedEpochs < CALIBRATION_EPOCHS) {
            // Still calibrating — no commits yet, no hypnogram yet. Guarded on the committed
            // counter so a transient drop in observedSf (which can inflate epochSamples and
            // shrink totalCompletedEpochs) never wipes an already-committed hypnogram.
            streamSession.sleepStages = [];
          } else if (totalCompletedEpochs > committedEpochsRef.current) {
            const nowStageMs = Date.now();
            if (nowStageMs - lastStageRecomputeMsRef.current >= STAGE_RECOMPUTE_MS) {
              lastStageRecomputeMsRef.current = nowStageMs;

              // Run the algorithm over the full buffer to get the best available labels
              // *right now*, but only use it to fill in epochs we haven't yet committed.
              const freshLabels = computeLabelsFromAmplitude(rawValues, observedSf);

              if (committedEpochsRef.current === 0) {
                // First commit: freeze the first CALIBRATION_EPOCHS labels in one shot.
                const initial = freshLabels.slice(0, CALIBRATION_EPOCHS);
                committedLabelsRef.current = initial;
                committedEpochsRef.current = initial.length;
              }

              // Catch up any further completed epochs one-by-one (handles throttling/jitter).
              while (
                committedEpochsRef.current < totalCompletedEpochs &&
                committedEpochsRef.current < freshLabels.length
              ) {
                committedLabelsRef.current.push(freshLabels[committedEpochsRef.current]);
                committedEpochsRef.current += 1;
              }

              // Rebuild the session's stage segments from the frozen label array.
              streamSession.sleepStages = labelsToSegments(
                committedLabelsRef.current,
                sessionStart,
              );
            }
          }

          // Throttle React state updates to ~15 Hz to avoid overwhelming rendering.
          const nowMs = Date.now();
          if (nowMs - lastReactUpdateMs >= REACT_UPDATE_INTERVAL_MS) {
            lastReactUpdateMs = nowMs;
            const updatedSession: SleepSessionData = {
              ...streamSession,
              // Snapshot the current array lengths so React detects a new object even
              // though the underlying arrays are shared (avoids deep-copy overhead).
              timestamps: streamSession.timestamps.slice(),
              channelData: streamSession.channelData.slice(),
              sleepStages: [...streamSession.sleepStages],
            };

            // Always persist the live session in sleepSessions (preserving any
            // review-mode sessions that may also be loaded).
            setSleepSessions(prev => {
              const rest = prev.filter(s => !s.id.startsWith('edf_stream_'));
              return [...rest, updatedSession];
            });

            // Only overwrite the displayed session when in live mode so review
            // session selection is not stomped by background live updates.
            if (liveUpdateSelectedRef.current) {
              setSelectedSession(updatedSession);
            }
          }
          
          sampleCount++;
          
        } catch (error) {
          console.error('Error parsing stream packet:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('EventSource connection error:', error);
        eventSource.close();
        setEdfStreamState(prev => ({ 
          ...prev, 
          isStreaming: false, 
          plotError: 'Connection lost. Please check backend.' 
        }));
      };
      
    } catch (error) {
      console.error('Error starting stream setup:', error);
      setEdfStreamState(prev => ({ ...prev, plotError: 'Setup failed' }));
    } finally {
      setIsLoading(false);
    }
  }, []);

  /** Loads sessions for Review mode: backend filters with list_user_sessions then decrypt_session for each .eeg. */
  const fetchSessionList = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch('/api/sessions/list');
      const data = await res.json();
      if (!data.success) {
        setSessionList([]);
        return;
      }
      const list: SessionMetadata[] = (data.sessions || []).map((s: {
        id: string;
        startTime: string;
        endTime: string;
        deviceId: string;
        date: string;
        hourRange: string;
      }) => ({
        id: s.id,
        startTime: s.startTime,
        endTime: s.endTime,
        deviceId: s.deviceId,
        date: s.date,
        hourRange: s.hourRange,
      }));
      setSessionList(list);
    } catch (err) {
      console.error('Failed to fetch session list:', err);
      setSessionList([]);
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const loadSessionData = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/data`);
      const data = await res.json();
      if (!data.success || !data.timestamps || !data.channelData) {
        console.error('Failed to load session:', data.error);
        setIsLoading(false);
        return;
      }
      const timestamps = (data.timestamps as number[]).map((ms: number) => new Date(ms));
      const sleepStages: SleepStage[] = (data.sleepStages || []).map((s: { type: string; startTime: string; endTime: string; duration: number }) => ({
        type: s.type as SleepStage['type'],
        startTime: new Date(s.startTime),
        endTime: new Date(s.endTime),
        duration: s.duration,
      }));
      const session: SleepSessionData = {
        id: data.id ?? sessionId,
        startTime: new Date(data.startTime),
        endTime: new Date(data.endTime),
        deviceId: data.deviceId ?? sessionId,
        timestamps,
        channelData: data.channelData,
        sleepStages,
        quality: (data.quality as SleepSessionData['quality']) ?? 'good',
        sessionType: (data.sessionType as SleepSessionData['sessionType']) ?? 'night',
      };
      setSleepSessions(prev => [...prev.filter(s => s.id !== session.id), session]);
      setSelectedSession(session);
    } catch (err) {
      console.error('Failed to load session:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const calculateSleepStatsForSession = useCallback((session: SleepSessionData | null): SleepStats | null => {
    if (!session) return null;
    const timestamps = session.timestamps;
    const stages = session.sleepStages;
    const n = timestamps.length;

    if (n === 0) {
      return {
        totalDuration: "0",
        stageDurations: { awake: 0, light: 0, deep: 0, rem: 0 },
        efficiency: "—",
        numCycles: 0
      };
    }

    const startMs = timestamps[0].getTime();
    const endMs = timestamps[n - 1].getTime();
    const totalMinutes = (endMs - startMs) / 60000;
    // Keep full precision so the UI duration can update every second.
    // Rounding to 2 decimals in hours only updates every ~36 seconds.
    const totalDurationHours = String(totalMinutes / 60);

    const stageDurations: Record<string, number> = { awake: 0, light: 0, deep: 0, rem: 0 };
    let awakeMinutes = 0;
    for (const stage of stages) {
      const stageStart = Math.max(stage.startTime.getTime(), startMs);
      const stageEnd = Math.min(stage.endTime.getTime(), endMs);
      if (stageEnd <= stageStart) continue;
      const overlapMin = (stageEnd - stageStart) / 60000;
      stageDurations[stage.type] = (stageDurations[stage.type] ?? 0) + overlapMin;
      if (stage.type === 'awake') awakeMinutes += overlapMin;
    }

    const stagedTotalMinutes =
      (stageDurations.awake ?? 0) +
      (stageDurations.light ?? 0) +
      (stageDurations.deep ?? 0) +
      (stageDurations.rem ?? 0);
    const asleepMinutes =
      (stageDurations.light ?? 0) +
      (stageDurations.deep ?? 0) +
      (stageDurations.rem ?? 0);
    const efficiency = stagedTotalMinutes > 0
      ? ((asleepMinutes / stagedTotalMinutes) * 100).toFixed(1)
      : "—";

    // Rough estimate: typical cycle ~2 h; count ≈ (light + deep + REM) / 2 h
    const EST_HOURS_PER_CYCLE = 2;
    const numCycles =
      asleepMinutes <= 0
        ? 0
        : Math.round(asleepMinutes / 60 / EST_HOURS_PER_CYCLE);

    return {
      totalDuration: totalDurationHours,
      stageDurations,
      efficiency,
      numCycles
    };
  }, []);

  const calculateSleepStats = useCallback((): SleepStats | null => {
    return calculateSleepStatsForSession(selectedSession);
  }, [calculateSleepStatsForSession, selectedSession]);

  const setLiveUpdateEnabled = useCallback((enabled: boolean) => {
    liveUpdateSelectedRef.current = enabled;
  }, []);

  const cleanupStreams = useCallback(() => {
    if (edfEventSourceRef.current) {
      console.log("Closing EventSource");
      edfEventSourceRef.current.close();
      edfEventSourceRef.current = null;
    }
    setEdfStreamState({ isStreaming: false, plotError: '' });
    committedLabelsRef.current = [];
    committedEpochsRef.current = 0;
    lastStageRecomputeMsRef.current = 0;
  }, []);

  return {
    sleepSessions,
    selectedSession,
    sessionList,
    isLoading,
    isLoadingSessions,
    edfStreamState,
    setSelectedSession,
    setSleepSessions,
    loadDemoSleepData,
    loadEDFPlot,
    fetchSessionList,
    loadSessionData,
    getSleepStageAtTime,
    calculateSleepStatsForSession,
    calculateSleepStats,
    cleanupStreams,
    isStreamActive,
    setLiveUpdateEnabled
  };
};