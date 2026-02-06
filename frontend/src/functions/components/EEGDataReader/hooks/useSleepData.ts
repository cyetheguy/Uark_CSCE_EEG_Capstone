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
    livePlotImage: '',
    edfPlotUrl: '',
    plotError: ''
  });
  
  const edfEventSourceRef = useRef<EventSource | null>(null);
  const plotStreamRef = useRef<EventSource | null>(null);

  const generateMockSleepStages = useCallback((start: Date, end: Date): SleepStage[] => {
    const durationMs = end.getTime() - start.getTime();
    const stages: SleepStage[] = [];
    
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
    
    return stages;
  }, []);

  const getSleepStageAtTime = useCallback((stages: SleepStage[], time: Date): SleepStage['type'] => {
    const timeMs = time.getTime();
    const stage = stages.find(s => 
      timeMs >= s.startTime.getTime() && timeMs <= s.endTime.getTime()
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
        sleepStages: generateMockSleepStages(lastNight, sessionEnd),
        quality: 'good',
        sessionType: 'night'
      };
      
      const durationMs = 8 * 60 * 60 * 1000;
      const sampleInterval = 1000;
      const numSamples = durationMs / sampleInterval;
      
      const timestamps: Date[] = [];
      const channelData: number[][] = [];
      
      for (let i = 0; i < numSamples; i++) {
        const timestamp = new Date(lastNight.getTime() + i * sampleInterval);
        timestamps.push(timestamp);
        
        const timeOffset = i / numSamples;
        const sleepStage = getSleepStageAtTime(mockSession.sleepStages, timestamp);
        
        let amplitude = 0;
        let frequency = 0;
        
        switch (sleepStage) {
          case 'awake':
            amplitude = 30 + Math.random() * 20;
            frequency = 15 + Math.random() * 10;
            break;
          case 'light':
            amplitude = 20 + Math.random() * 15;
            frequency = 8 + Math.random() * 6;
            break;
          case 'deep':
            amplitude = 50 + Math.random() * 30;
            frequency = 1 + Math.random() * 3;
            break;
          case 'rem':
            amplitude = 10 + Math.random() * 10;
            frequency = 5 + Math.random() * 3;
            break;
        }
        
        const value = amplitude * Math.sin(2 * Math.PI * frequency * timeOffset) + 
                      (Math.random() - 0.5) * 5;
        
        channelData.push([value]);
      }
      
      mockSession.timestamps = timestamps;
      mockSession.channelData = channelData;
      
      setSleepSessions(prev => {
        const filtered = prev.filter(s => s.id !== mockSession.id);
        return [...filtered, mockSession];
      });
      
      setSelectedSession(mockSession);
      setIsLoading(false);
      
    }, 1500);
  }, [generateMockSleepStages, getSleepStageAtTime]);

  const generateDemoSessionList = useCallback(() => {
    const demoList: SessionMetadata[] = [];
    const now = new Date();
    
    for (let i = 0; i < 5; i++) {
      const sessionDate = new Date(now);
      sessionDate.setDate(sessionDate.getDate() - i);
      
      const startTime = new Date(sessionDate);
      startTime.setHours(22, 0, 0, 0);
      
      const endTime = new Date(startTime);
      endTime.setHours(endTime.getHours() + 8);
      
      demoList.push({
        id: `demo_session_${i}`,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        deviceId: 'EEG_Sleep_Device_01',
        date: sessionDate.toLocaleDateString(),
        hourRange: `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      });
    }
    
    setSessionList(demoList);
  }, []);

  const loadEDFPlot = useCallback(async (username: string = 'demo') => {
    setIsLoading(true);
    
    try {
      const infoResponse = await fetch(`http://localhost:5000/api/edf/info?username=${encodeURIComponent(username)}`);
      const infoData = await infoResponse.json();
      
      if (!infoData.success) {
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
        sleepStages: generateMockSleepStages(sessionStart, new Date(sessionStart.getTime() + 8 * 60 * 60 * 1000)),
        quality: 'good',
        sessionType: 'night'
      };
      
      setSleepSessions([streamSession]);
      setSelectedSession(streamSession);
      setEdfStreamState(prev => ({ ...prev, isStreaming: true, livePlotImage: '', plotError: '' }));
      
      const plotUrl = `http://localhost:5000/api/edf/plot/stream?username=${encodeURIComponent(username)}`;
      const plotStream = new EventSource(plotUrl);
      plotStreamRef.current = plotStream;
      
      plotStream.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.error) {
            console.error('Plot error:', data.error);
            setEdfStreamState(prev => ({ ...prev, plotError: data.error }));
            return;
          }
          if (data.done) {
            plotStream.close();
            return;
          }
          if (data.image) {
            setEdfStreamState(prev => ({ ...prev, livePlotImage: data.image, plotError: '' }));
          }
        } catch (e) {
          console.error('Plot stream parse error:', e);
        }
      };
      
      plotStream.onerror = () => {
        plotStream.close();
        setEdfStreamState(prev => ({ ...prev, plotError: prev.plotError || 'Connection lost' }));
      };
      
      const eventSource = new EventSource('http://localhost:5000/api/edf/stream');
      edfEventSourceRef.current = eventSource;
      
      let sampleCount = 0;
      const streamStartTime = Date.now();
      
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.error) {
            eventSource.close();
            setEdfStreamState(prev => ({ ...prev, isStreaming: false }));
            return;
          }
          
          const timestamp = new Date(sessionStart.getTime() + data.timestamp * 1000);
          streamSession.timestamps.push(timestamp);
          streamSession.channelData.push([data.value]);
          
          if (sampleCount % 100 === 0) {
            setSleepSessions([{...streamSession}]);
            setSelectedSession({...streamSession});
          }
          
          sampleCount++;
          
        } catch (error) {
          console.error('Error parsing stream:', error);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('Stream error:', error);
        eventSource.close();
        if (plotStreamRef.current) {
          plotStreamRef.current.close();
          plotStreamRef.current = null;
        }
        setEdfStreamState(prev => ({ ...prev, isStreaming: false }));
      };
      
    } catch (error) {
      console.error('Error starting stream:', error);
    } finally {
      setIsLoading(false);
    }
  }, [generateMockSleepStages]);

  const fetchSessionList = useCallback(async () => {
    setIsLoadingSessions(true);
    try {
      const response = await fetch('http://localhost:5000/api/sessions/list', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const data = await response.json();
        setSessionList(data.sessions || []);
      } else {
        throw new Error('Failed to fetch sessions');
      }
    } catch (error) {
      console.error('Error fetching session list:', error);
      generateDemoSessionList();
    } finally {
      setIsLoadingSessions(false);
    }
  }, [generateDemoSessionList]);

  const loadSessionData = useCallback(async (sessionId: string) => {
    setIsLoading(true);
    try {
      const response = await fetch(`http://localhost:5000/api/sessions/${sessionId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (response.ok) {
        const sessionData = await response.json();
        
        const transformedSession: SleepSessionData = {
          id: sessionData.id,
          startTime: new Date(sessionData.startTime),
          endTime: new Date(sessionData.endTime),
          deviceId: sessionData.deviceId,
          channelData: sessionData.channelData || [],
          timestamps: (sessionData.timestamps || []).map((ts: string) => new Date(ts)),
          sleepStages: sessionData.sleepStages?.map((stage: any) => ({
            type: stage.type,
            startTime: new Date(stage.startTime),
            endTime: new Date(stage.endTime),
            duration: stage.duration
          })) || [],
          quality: sessionData.quality || 'good',
          sessionType: sessionData.sessionType || 'night'
        };

        setSleepSessions(prev => {
          const filtered = prev.filter(s => s.id !== sessionId);
          return [...filtered, transformedSession];
        });
        
        setSelectedSession(transformedSession);
        
      } else {
        throw new Error('Failed to load session data');
      }
    } catch (error) {
      console.error('Error loading session data:', error);
      loadDemoSleepData(sessionId);
    } finally {
      setIsLoading(false);
    }
  }, [loadDemoSleepData]);

  const calculateSleepStats = useCallback((): SleepStats | null => {
    if (!selectedSession) return null;
    
    const totalDuration = (selectedSession.endTime.getTime() - selectedSession.startTime.getTime()) / (60 * 60 * 1000);
    const stageDurations = selectedSession.sleepStages.reduce((acc, stage) => {
      acc[stage.type] = (acc[stage.type] || 0) + stage.duration;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      totalDuration: totalDuration.toFixed(1),
      stageDurations,
      efficiency: ((totalDuration - (stageDurations.awake || 0) / 60) / totalDuration * 100).toFixed(1),
      numCycles: Math.ceil(selectedSession.sleepStages.length / 5)
    };
  }, [selectedSession]);

  const cleanupStreams = useCallback(() => {
    if (edfEventSourceRef.current) {
      edfEventSourceRef.current.close();
    }
    if (plotStreamRef.current) {
      plotStreamRef.current.close();
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