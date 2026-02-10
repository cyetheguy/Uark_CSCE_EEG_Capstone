import { useState, useCallback, useRef } from 'react';
import { SleepSessionData, SleepStage, SessionMetadata, SleepStats, EDFStreamState } from '../types';

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

  // Updated to support "fast" demo stages for live viewing
  const generateMockSleepStages = useCallback((start: Date, end: Date, isLiveDemo: boolean = false): SleepStage[] => {
    const durationMs = end.getTime() - start.getTime();
    const stages: SleepStage[] = [];
    
    if (isLiveDemo) {
      // FAST CYCLING for Live Demo (Change every 10 seconds)
      let currentTime = start.getTime();
      const stageTypes: SleepStage['type'][] = ['awake', 'light', 'deep', 'rem', 'light'];
      let index = 0;
      
      while (currentTime < end.getTime()) {
        const type = stageTypes[index % stageTypes.length];
        const stageDuration = 10 * 1000; // 10 seconds per stage
        const stageEnd = Math.min(currentTime + stageDuration, end.getTime());
        
        stages.push({
          type,
          startTime: new Date(currentTime),
          endTime: new Date(stageEnd),
          duration: (stageEnd - currentTime) / (60 * 1000)
        });
        
        currentTime = stageEnd;
        index++;
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

  const loadEDFPlot = useCallback(async (username: string = 'demo') => {
    setIsLoading(true);
    console.log("Initializing EDF Stream...");
    
    try {
      const infoResponse = await fetch(`http://localhost:5000/api/edf/info?username=${encodeURIComponent(username)}`);
      const infoData = await infoResponse.json();
      
      if (!infoData.success) {
        console.error("Failed to fetch EDF info:", infoData.error);
        setEdfStreamState(prev => ({ ...prev, plotError: infoData.error || 'Failed to load file' }));
        setIsLoading(false);
        return;
      }
      
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
        // Use isLiveDemo=true here for fast transitions
        sleepStages: generateMockSleepStages(sessionStart, new Date(sessionStart.getTime() + 8 * 60 * 60 * 1000), true),
        quality: 'good',
        sessionType: 'night'
      };
      
      setSleepSessions([streamSession]);
      setSelectedSession(streamSession);
      setEdfStreamState(prev => ({ ...prev, isStreaming: true, plotError: '' }));
      
      if (edfEventSourceRef.current) {
        edfEventSourceRef.current.close();
      }

      console.log("Connecting to EventSource: http://localhost:5000/api/edf/stream");
      const eventSource = new EventSource('http://localhost:5000/api/edf/stream');
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
          
          // Refresh UI frequently at start, then throttle
          if (sampleCount < 20 || sampleCount % 10 === 0) {
            setSelectedSession({ ...streamSession });
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
  }, [generateMockSleepStages]);

  const fetchSessionList = useCallback(async () => { /* ... */ }, [generateDemoSessionList]);
  const loadSessionData = useCallback(async (sessionId: string) => { /* ... */ }, [loadDemoSleepData]);

  const calculateSleepStats = useCallback((): SleepStats | null => {
    if (!selectedSession) return null;
    return {
      totalDuration: "8.0",
      stageDurations: { awake: 30, light: 200, deep: 150, rem: 100 },
      efficiency: "90",
      numCycles: 4
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