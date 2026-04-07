import { useState, useCallback, useRef } from 'react';
import { SleepSessionData, SleepStage, SessionMetadata, SleepStats, EDFStreamState } from '../types';
import { computeSleepStagesFromAmplitude, EPOCH_SEC } from '../utils/sleepStagesFromAmplitude';

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
  const liveStreamSfreqRef = useRef(100);
  const lastStageRecomputeMsRef = useRef(0);

  const STAGE_RECOMPUTE_MS = 2000;

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

  const generateDemoSessionList = useCallback(() => {
     const demoList: SessionMetadata[] = [];
     const now = new Date();
     for (let i = 0; i < 5; i++) {
       const d = new Date(now); d.setDate(d.getDate() - i);
       demoList.push({
         id: `demo_session_${i}`,
         startTime: new Date().toISOString(),
         endTime: new Date().toISOString(),
         deviceId: 'EEG_Device',
         date: d.toLocaleDateString(),
         hourRange: '10PM - 6AM'
       });
     }
     setSessionList(demoList);
  }, []);

  const loadEDFPlot = useCallback(async (username: string = 'demo', mode: 'live' | 'review' = 'live') => {
    setIsLoading(true);
    const modeParam = mode === 'live' ? 'live' : 'review';
    console.log(`Initializing stream (mode=${modeParam})...`);

    try {
      const infoResponse = await fetch(`http://localhost:5000/api/edf/info?username=${encodeURIComponent(username)}&mode=${modeParam}`);
      const infoData = await infoResponse.json();
      
      if (!infoData.success) {
        console.error("Failed to fetch EDF info:", infoData.error);
        setEdfStreamState(prev => ({ ...prev, plotError: infoData.error || 'Failed to load file' }));
        setIsLoading(false);
        return;
      }

      liveStreamSfreqRef.current = typeof infoData.sampling_rate === 'number' ? infoData.sampling_rate : 100;
      lastStageRecomputeMsRef.current = 0;
      
      const now = new Date();
      const sessionStart = new Date(now);
      sessionStart.setHours(22, 0, 0, 0);
      
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

      const streamUrl = `http://localhost:5000/api/edf/stream?mode=${modeParam}`;
      console.log("Connecting to EventSource:", streamUrl);
      const eventSource = new EventSource(streamUrl);
      edfEventSourceRef.current = eventSource;
      
      let sampleCount = 0;
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.error) {
            console.error('Stream backend error:', data.error);
            eventSource.close();
            setEdfStreamState(prev => ({ ...prev, isStreaming: false, plotError: data.error }));
            return;
          }
          
          const timestamp = new Date(sessionStart.getTime() + data.timestamp * 1000);
          streamSession.timestamps.push(timestamp);
          streamSession.channelData.push([data.value]);

          const sf = liveStreamSfreqRef.current;
          const epochSamples = Math.max(1, Math.round(EPOCH_SEC * sf));
          const vals = streamSession.channelData.map((row) => row[0]);
          if (vals.length >= epochSamples) {
            const nowMs = Date.now();
            if (nowMs - lastStageRecomputeMsRef.current >= STAGE_RECOMPUTE_MS) {
              lastStageRecomputeMsRef.current = nowMs;
              streamSession.sleepStages = computeSleepStagesFromAmplitude(vals, sf, sessionStart);
            }
          }
          
          // Update UI on every sample so amplitude and hypnogram reflect data every second
          // Use new array refs so React detects the change and re-renders
          setSelectedSession({
            ...streamSession,
            timestamps: [...streamSession.timestamps],
            channelData: streamSession.channelData.map((row) => [...row]),
            sleepStages: [...streamSession.sleepStages],
          });
          
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

  const fetchSessionList = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const res = await fetch('http://localhost:5000/api/sessions/list');
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
      const res = await fetch(`http://localhost:5000/api/sessions/${encodeURIComponent(sessionId)}/data`);
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

  const calculateSleepStats = useCallback((): SleepStats | null => {
    if (!selectedSession) return null;
    const timestamps = selectedSession.timestamps;
    const stages = selectedSession.sleepStages;
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
    const totalDurationHours = (totalMinutes / 60).toFixed(1);

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

    const efficiency = totalMinutes > 0
      ? Math.round((1 - awakeMinutes / totalMinutes) * 100).toString()
      : "—";

    // Rough estimate: typical cycle ~2 h; count ≈ (light + deep + REM) / 2 h
    const asleepMinutes =
      (stageDurations.light ?? 0) + (stageDurations.deep ?? 0) + (stageDurations.rem ?? 0);
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
  }, [selectedSession]);

  const cleanupStreams = useCallback(() => {
    if (edfEventSourceRef.current) {
      console.log("Closing EventSource");
      edfEventSourceRef.current.close();
      edfEventSourceRef.current = null;
    }
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
    generateDemoSessionList,
    loadEDFPlot,
    fetchSessionList,
    loadSessionData,
    getSleepStageAtTime,
    calculateSleepStats,
    cleanupStreams
  };
};