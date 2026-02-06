// This is the main application that manages the state:
// connection, data, UI preferences

// Coordinates between services and display components

// Timestamps show actual data collection time
// Data updates automatically via WebSocket (Maybe Bluetooth goes to .csv file first?)
import React, { useState, useEffect } from 'react';
import './EEGDataReader.css';

// Components
import LoginScreen from './components/LoginScreen';
import Header from './components/Header';
import SettingsScreen from './components/SettingsScreen';
import SessionPanel from './components/SessionPanel';
import SleepStatsPanel from './components/SleepStatsPanel';
import VisualizationPanel from './components/VisualizationPanel';
import UpdatesLog from './components/UpdatesLog';
import Footer from './components/Footer';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useSettings } from './hooks/useSettings';
import { useSleepData } from './hooks/useSleepData';
import { useUpdates } from './hooks/useUpdates';

// Types
import { SleepStats } from './types';

const EEGDataReader: React.FC = () => {
  // State
  const [mode, setMode] = useState<'live' | 'review'>('live'); // Default to live mode for EDF streaming
  const [showSettings, setShowSettings] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(0);
  const [showRawData, setShowRawData] = useState(false);
  const [timeView, setTimeView] = useState<'overview' | 'detailed' | 'stage'>('overview');
  const [selectedSleepStage, setSelectedSleepStage] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);

  // Custom Hooks
  const auth = useAuth();
  const settings = useSettings();
  const sleepData = useSleepData();
  const updates = useUpdates(settings.settings);

  // Effects
  useEffect(() => {
    if (auth.isAuthenticated) {
      sleepData.loadEDFPlot(auth.username || 'demo');
      updates.addUpdate('Starting real-time EDF stream at 100Hz...');
    }
  }, [auth.isAuthenticated, auth.username]);

  useEffect(() => {
    if (mode === 'review' && auth.isAuthenticated && sleepData.sessionList.length === 0) {
      sleepData.fetchSessionList();
    }
  }, [mode, auth.isAuthenticated]);

  useEffect(() => {
    return () => {
      sleepData.cleanupStreams();
    };
  }, []);

  // Event Handlers
  const handleModeChange = (newMode: 'live' | 'review') => {
    setMode(newMode);
    updates.addUpdate(`Switched to ${newMode} mode`);
  };

  const handleSelectSession = (session: any) => {
    sleepData.setSelectedSession(session);
  };

  const handleLoadSession = (sessionId: string) => {
    sleepData.loadSessionData(sessionId);
    updates.addUpdate(`Loading session ${sessionId} from server`);
  };

  const handleLoadDemoData = () => {
    sleepData.loadDemoSleepData();
    updates.addUpdate('Demo sleep session data loaded');
  };

  const handleFetchSessionList = () => {
    sleepData.fetchSessionList();
    updates.addUpdate('Refreshing session list from server');
  };

  const handleGenerateDemoSessionList = () => {
    sleepData.generateDemoSessionList();
    updates.addUpdate('Generated demo session list');
  };

  const handleUpdateSetting = (key: keyof typeof settings.settings, value: any) => {
    settings.updateSetting(key, value);
    updates.addUpdate(`Setting updated: ${key} = ${value}`);
  };

  const handleResetSettings = () => {
    settings.resetSettings();
    updates.addUpdate('Settings reset to defaults');
  };

  const handleLogout = () => {
    auth.handleLogout();
    sleepData.cleanupStreams();
    updates.addUpdate('Logged out successfully');
  };

  const handleClearData = () => {
    sleepData.setSleepSessions([]);
    sleepData.setSelectedSession(null);
    updates.addUpdate('Cleared all sleep session data');
  };

  const handleClearUpdates = () => {
    updates.clearUpdates();
  };

  // Calculations
  const sleepStats: SleepStats | null = sleepData.calculateSleepStats();

  // Format data for EEGChart
  const getChartData = () => {
    if (!sleepData.selectedSession) return [];
    
    return sleepData.selectedSession.timestamps.map((timestamp, index) => ({
      timestamp,
      value: sleepData.selectedSession!.channelData[index][selectedChannel],
      channel: selectedChannel,
      deviceId: sleepData.selectedSession!.deviceId,
      quality: sleepData.selectedSession!.quality,
      sleepStage: sleepData.getSleepStageAtTime(sleepData.selectedSession!.sleepStages, timestamp)
    }));
  };

  // Render Login Screen (inside 16:9 viewport)
  if (!auth.isAuthenticated) {
    return (
      <div className="eeg-app-viewport">
        <LoginScreen
          username={auth.username}
          password={auth.password}
          loginError={auth.loginError}
          isLoading={auth.isLoading}
          onUsernameChange={auth.setUsername}
          onPasswordChange={auth.setPassword}
          onLogin={auth.handleLogin}
        />
      </div>
    );
  }

  // Render Main Application (full-width, pre-16:9 layout)
  return (
    <div className="app-container">
      {showSettings && (
        <SettingsScreen
          settings={settings.settings}
          onUpdateSetting={handleUpdateSetting}
          onResetSettings={handleResetSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      <Header
        username={auth.username}
        mode={mode}
        onModeChange={handleModeChange}
        onShowSettings={() => setShowSettings(true)}
        onLogout={handleLogout}
      />

      <main className="main-content">
        <SessionPanel
          mode={mode}
          sleepSessions={sleepData.sleepSessions}
          selectedSession={sleepData.selectedSession}
          sessionList={sleepData.sessionList}
          isLoading={sleepData.isLoading}
          isLoadingSessions={sleepData.isLoadingSessions}
          onSelectSession={handleSelectSession}
          onLoadSession={handleLoadSession}
          onLoadDemoData={handleLoadDemoData}
          onFetchSessionList={handleFetchSessionList}
          onGenerateDemoSessionList={handleGenerateDemoSessionList}
          onClearData={handleClearData}
        />

        <SleepStatsPanel
          sleepStats={sleepStats}
          settings={settings.settings}
        />

        {sleepData.edfStreamState.edfPlotUrl && (
          <div className="visualization-panel">
            <div className="panel-header">
              <h2>EDF File Analysis (Python Generated)</h2>
            </div>
            <div className="visualization-content">
              <div style={{ backgroundColor: '#2d3748', borderRadius: '8px', padding: '1rem', textAlign: 'center' }}>
                <img
                  src={sleepData.edfStreamState.edfPlotUrl}
                  alt="EEG Analysis"
                  style={{ width: '100%', maxWidth: '1200px', height: 'auto', borderRadius: '8px' }}
                />
                <p style={{ color: '#cbd5e0', marginTop: '1rem', fontSize: '0.9rem' }}>
                  Real-time EEG analysis from backend/sessions/SC4001E0-PSG.edf
                  <br />
                  Generated using matplotlib with power spectrum analysis
                </p>
              </div>
            </div>
          </div>
        )}

        {sleepData.edfStreamState.isStreaming && (
          <div className="visualization-panel">
            <div className="panel-header">
              <h2>🔴 LIVE EDF Stream - 100Hz</h2>
            </div>
            <div className="visualization-content" style={{ padding: '1rem' }}>
              <div style={{ backgroundColor: '#234e52', borderRadius: '8px', padding: '1.5rem', border: '2px solid #38b2ac' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
                  <span style={{ width: 12, height: 12, backgroundColor: '#f56565', borderRadius: '50%', animation: 'pulse 1.5s infinite', display: 'inline-block' }} />
                  <span style={{ color: '#e6fffa', fontSize: '1.1rem', fontWeight: 'bold' }}>Real-Time Data Streaming Active</span>
                </div>
                <div style={{ color: '#b2f5ea', fontSize: '0.95rem', lineHeight: '1.8' }}>
                  <p style={{ margin: '0.5rem 0' }}>📡 <strong>Source:</strong> backend/sessions/SC4001E0-PSG.edf</p>
                  <p style={{ margin: '0.5rem 0' }}>⚡ <strong>Sampling Rate:</strong> 100 Hz (10ms per sample)</p>
                  <p style={{ margin: '0.5rem 0' }}>📊 <strong>Samples Loaded:</strong> {sleepData.selectedSession?.channelData.length.toLocaleString() || 0}</p>
                  <p style={{ margin: '0.5rem 0' }}>⏱️ <strong>Duration:</strong> {sleepData.selectedSession ? (sleepData.selectedSession.channelData.length / 100 / 60).toFixed(2) : 0} minutes</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <VisualizationPanel
          selectedSession={sleepData.selectedSession}
          settings={settings.settings}
          edfStreamState={sleepData.edfStreamState}
          getSleepStageAtTime={sleepData.getSleepStageAtTime}
          selectedChannel={selectedChannel}
          showRawData={showRawData}
          timeView={timeView}
          selectedSleepStage={selectedSleepStage}
          onShowRawDataChange={setShowRawData}
          onTimeViewChange={setTimeView}
          onSelectedSleepStageChange={setSelectedSleepStage}
          getChartData={getChartData}
        />

        <UpdatesLog
          updates={updates.updates}
          autoScroll={autoScroll}
          onAutoScrollChange={setAutoScroll}
          onClearUpdates={handleClearUpdates}
        />
      </main>

      <Footer mode={mode} />
    </div>
  );
};

export default EEGDataReader;

// // Older, full version:
// import React, { useState, useEffect, useRef } from 'react';
// import './EEGDataReader.css';
// import EEGChart from './components/EEGChart'; // Assuming this is in the same directory

// interface SleepSessionData {
//   id: string;
//   startTime: Date;
//   endTime: Date;
//   deviceId: string;
//   channelData: number[][]; // Array of arrays: [timestamp][channel]
//   timestamps: Date[];
//   sleepStages: SleepStage[];
//   quality: 'good' | 'fair' | 'poor';
//   sessionType: 'night' | 'nap' | 'baseline';
// }

// interface SleepStage {
//   type: 'awake' | 'light' | 'deep' | 'rem';
//   startTime: Date;
//   endTime: Date;
//   duration: number; // minutes
// }

// interface AppSettings {
//   theme: 'light' | 'dark' | 'auto';
//   timeFormat: '12h' | '24h';
//   notifications: boolean;
//   autoLoadDemoData: boolean;
//   dataRetention: number; // days
//   chartType: 'line' | 'area' | 'waveform';
//   defaultDevice: string;
//   sleepStageColors: Record<string, string>;
//   showSleepStages: boolean;
//   showBaseline: boolean;
//   yAxisRange: number; // µV range
// }

// const EEGDataReader: React.FC = () => {
//   const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
//   const [isLoading, setIsLoading] = useState<boolean>(false);
//   const [username, setUsername] = useState<string>('');
//   const [password, setPassword] = useState<string>('');
//   const [loginError, setLoginError] = useState<string>('');
  
//   const [isConnected, setIsConnected] = useState<boolean>(false);
//   const [deviceName, setDeviceName] = useState<string>('EEG_Sleep_Device');
//   const [connectionUrl, setConnectionUrl] = useState<string>('ws://localhost:8080/ws/sleep');
//   const [sleepSessions, setSleepSessions] = useState<SleepSessionData[]>([]);
//   const [selectedSession, setSelectedSession] = useState<SleepSessionData | null>(null);
//   const [updates, setUpdates] = useState<string[]>([]);
//   const [showRawData, setShowRawData] = useState<boolean>(false);
  
//   // Display options
//   const [selectedChannel, setSelectedChannel] = useState<number>(0);
//   const [timeView, setTimeView] = useState<'overview' | 'detailed' | 'stage'>('overview');
//   const [selectedSleepStage, setSelectedSleepStage] = useState<string>('all');
//   const [autoScroll, setAutoScroll] = useState<boolean>(true);
  
//   // Settings screen state 
//   const [showSettings, setShowSettings] = useState<boolean>(false);
//   const [settings, setSettings] = useState<AppSettings>({
//     theme: 'auto', // Changed to dark as default
//     timeFormat: '24h', // Changed to 24h for medical/scientific data
//     notifications: true,
//     autoLoadDemoData: true,
//     dataRetention: 30,
//     chartType: 'waveform',
//     defaultDevice: 'EEG_Sleep_Device',
//     sleepStageColors: {
//       awake: '#e53e3e',    // Red
//       light: '#ed8936',    // Orange
//       deep: '#38a169',     // Green
//       rem: '#667eea'       // Blue
//     },
//     showSleepStages: true,
//     showBaseline: true,
//     yAxisRange: 100
//   });

//   // Demo login credentials
//   const DEMO_CREDENTIALS = {
//     username: 'demo',
//     password: 'sleep123',
//     admin: {
//       username: 'admin',
//       password: 'admin123'
//     }
//   };

//   // Apply theme based on settings - Set dark as default
//   useEffect(() => {
//     const applyTheme = () => {
//       const theme = settings.theme;
//       let themeClass = 'theme-dark'; // Default to dark
      
//       if (theme === 'light' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: light)').matches)) {
//         themeClass = 'theme-light';
//       }
      
//       document.documentElement.className = themeClass;
//     };
    
//     applyTheme();
//   }, [settings.theme]);

//   // Load settings from localStorage on component mount
//   useEffect(() => {
//     const savedSettings = localStorage.getItem('eeg-sleep-settings');
//     if (savedSettings) {
//       try {
//         const parsed = JSON.parse(savedSettings);
//         // Ensure theme is dark by default if not set
//         if (!parsed.theme) {
//           parsed.theme = 'dark';
//         }
//         setSettings(parsed);
//       } catch (error) {
//         console.error('Error loading settings:', error);
//       }
//     }
//   }, []);

//   // Save settings to localStorage when they change
//   useEffect(() => {
//     localStorage.setItem('eeg-sleep-settings', JSON.stringify(settings));
//   }, [settings]);

//   // Load demo sleep data when authenticated
//   useEffect(() => {
//     if (isAuthenticated && settings.autoLoadDemoData && sleepSessions.length === 0) {
//       loadDemoSleepData();
//     }
//   }, [isAuthenticated, settings.autoLoadDemoData]);

//   const loadDemoSleepData = () => {
//     setIsLoading(true);
    
//     // Simulate loading sleep session data
//     setTimeout(() => {
//       const now = new Date();
//       const lastNight = new Date(now);
//       lastNight.setDate(lastNight.getDate() - 1);
//       lastNight.setHours(22, 0, 0, 0); // 10 PM start
      
//       const sessionEnd = new Date(lastNight);
//       sessionEnd.setHours(sessionEnd.getHours() + 8); // 8-hour sleep
      
//       // Generate mock sleep data
//       const mockSession: SleepSessionData = {
//         id: `session_${Date.now()}`,
//         startTime: lastNight,
//         endTime: sessionEnd,
//         deviceId: 'EEG_Sleep_Device_01',
//         timestamps: [],
//         channelData: [],
//         sleepStages: generateMockSleepStages(lastNight, sessionEnd),
//         quality: 'good',
//         sessionType: 'night'
//       };
      
//       // Generate 8 hours of data at 256Hz (simplified to 1 sample per second for demo)
//       const durationMs = 8 * 60 * 60 * 1000; // 8 hours in milliseconds
//       const sampleInterval = 1000; // 1 second per sample
//       const numSamples = durationMs / sampleInterval;
      
//       const timestamps: Date[] = [];
//       const channelData: number[][] = [];
      
//       for (let i = 0; i < numSamples; i++) {
//         const timestamp = new Date(lastNight.getTime() + i * sampleInterval);
//         timestamps.push(timestamp);
        
//         // Generate realistic EEG sleep data
//         const timeOffset = i / numSamples; // 0 to 1
//         const sleepStage = getSleepStageAtTime(mockSession.sleepStages, timestamp);
        
//         // Different patterns for different sleep stages
//         let amplitude = 0;
//         let frequency = 0;
        
//         switch (sleepStage) {
//           case 'awake':
//             amplitude = 30 + Math.random() * 20;
//             frequency = 15 + Math.random() * 10;
//             break;
//           case 'light':
//             amplitude = 20 + Math.random() * 15;
//             frequency = 8 + Math.random() * 6;
//             break;
//           case 'deep':
//             amplitude = 50 + Math.random() * 30;
//             frequency = 1 + Math.random() * 3;
//             break;
//           case 'rem':
//             amplitude = 10 + Math.random() * 10;
//             frequency = 5 + Math.random() * 3;
//             break;
//         }
        
//         // Generate sinusoidal EEG data with noise
//         const value = amplitude * Math.sin(2 * Math.PI * frequency * timeOffset) + 
//                       (Math.random() - 0.5) * 5; // Add noise
        
//         channelData.push([value]); // Single channel for simplicity
//       }
      
//       mockSession.timestamps = timestamps;
//       mockSession.channelData = channelData;
      
//       setSleepSessions([mockSession]);
//       setSelectedSession(mockSession);
//       setIsLoading(false);
      
//       addUpdate('Demo sleep session data loaded');
//       addUpdate(`Sleep session: ${lastNight.toLocaleDateString()} ${lastNight.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${sessionEnd.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
//       addUpdate(`Sleep stages detected: ${mockSession.sleepStages.map(s => s.type).join(', ')}`);
      
//     }, 1500);
//   };

//   const generateMockSleepStages = (start: Date, end: Date): SleepStage[] => {
//     const durationMs = end.getTime() - start.getTime();
//     const stages: SleepStage[] = [];
    
//     // Typical sleep cycle: awake → light → deep → light → REM → repeat
//     const stageSequence: Array<{type: SleepStage['type'], duration: number}> = [
//       { type: 'awake', duration: 0.1 },   // 10% - falling asleep
//       { type: 'light', duration: 0.3 },   // 30% - light sleep
//       { type: 'deep', duration: 0.25 },   // 25% - deep sleep
//       { type: 'light', duration: 0.15 },  // 15% - light sleep
//       { type: 'rem', duration: 0.2 },     // 20% - REM sleep
//     ];
    
//     let currentTime = start.getTime();
    
//     // Generate 4-5 sleep cycles
//     const numCycles = 4 + Math.floor(Math.random() * 2);
    
//     for (let cycle = 0; cycle < numCycles; cycle++) {
//       for (const stage of stageSequence) {
//         const stageDuration = (durationMs / numCycles) * stage.duration;
//         const stageEnd = currentTime + stageDuration;
        
//         stages.push({
//           type: stage.type,
//           startTime: new Date(currentTime),
//           endTime: new Date(stageEnd),
//           duration: stageDuration / (60 * 1000) // Convert to minutes
//         });
        
//         currentTime = stageEnd;
        
//         // Stop if we've reached the end time
//         if (currentTime >= end.getTime()) break;
//       }
//       if (currentTime >= end.getTime()) break;
//     }
    
//     return stages;
//   };

//   const getSleepStageAtTime = (stages: SleepStage[], time: Date): SleepStage['type'] => {
//     const timeMs = time.getTime();
//     const stage = stages.find(s => 
//       timeMs >= s.startTime.getTime() && timeMs <= s.endTime.getTime()
//     );
//     return stage ? stage.type : 'awake';
//   };

//   const handleLogin = async (e: React.FormEvent) => {
//     e.preventDefault();
//     setIsLoading(true);
//     setLoginError('');
    
//     // Simulate authentication delay
//     await new Promise(resolve => setTimeout(resolve, 800));
//     try {
//       const response = await fetch('http://localhost:5000/api/login', {
//         method: 'POST',
//         headers: {
//           'Content-Type': 'application/json',
//         },
//         body: JSON.stringify({ username, password }),
//       });

//       const data = await response.json();

//       // CHECK FOR STATUS 1 HERE
//       if (data.success === 1) {
//         console.log("Backend returned 1: Success");
//         setIsAuthenticated(true);
//       } else {
//         console.log("Backend returned 0: Failure");
//         alert("Login Failed: Invalid Username or Password");
//       }

//     } catch (error) {
//       console.error("Error:", error);
//       alert("Server connection failed");
//     } finally {
//       setIsLoading(false);
//     }
    
//     // Check credentials
//     /*if (
//       (username === DEMO_CREDENTIALS.username && password === DEMO_CREDENTIALS.password) ||
//       (username === DEMO_CREDENTIALS.admin.username && password === DEMO_CREDENTIALS.admin.password)
//     ) {
//       setIsAuthenticated(true);
//       addUpdate(`User ${username} logged in successfully`);
      
//     } else {
//       setLoginError('Invalid username or password. Try demo/sleep123 or admin/admin123');
//     }
   
    
//     setIsLoading(false);*/
//   };

//   const handleLogout = () => {
//     setIsAuthenticated(false);
//     setUsername('');
//     setPassword('');
//     setSleepSessions([]);
//     setSelectedSession(null);
//     setUpdates([]);
//     setLoginError('');
//     addUpdate('Logged out successfully');
//   };

//   const addUpdate = (message: string) => {
//     const timeFormat = settings.timeFormat === '24h' ? 'HH:mm:ss' : 'hh:mm:ss A';
//     const timestamp = new Date().toLocaleTimeString('en-US', { 
//       hour12: settings.timeFormat !== '24h',
//       hour: '2-digit',
//       minute: '2-digit',
//       second: '2-digit'
//     });
//     setUpdates(prev => [...prev, `[${timestamp}]: ${message}`]);
//   };

//   const clearData = () => {
//     setSleepSessions([]);
//     setSelectedSession(null);
//     addUpdate('Cleared all sleep session data');
//   };

//   const clearUpdates = () => {
//     setUpdates([]);
//   };

//   const resetSettings = () => {
//     const defaultSettings: AppSettings = {
//       theme: 'dark', // Reset to dark
//       timeFormat: '24h',
//       notifications: true,
//       autoLoadDemoData: true,
//       dataRetention: 30,
//       chartType: 'waveform',
//       defaultDevice: 'EEG_Sleep_Device',
//       sleepStageColors: {
//         awake: '#e53e3e',
//         light: '#ed8936',
//         deep: '#38a169',
//         rem: '#667eea'
//       },
//       showSleepStages: true,
//       showBaseline: true,
//       yAxisRange: 100
//     };
//     setSettings(defaultSettings);
//     addUpdate('Settings reset to defaults');
//   };

//   const updateSetting = (key: keyof AppSettings, value: any) => {
//     setSettings(prev => ({
//       ...prev,
//       [key]: value
//     }));
//     addUpdate(`Setting updated: ${key} = ${value}`);
//   };

//   // Auto-scroll updates log
//   useEffect(() => {
//     if (autoScroll && updates.length > 0) {
//       const updatesContainer = document.getElementById('updates-log');
//       if (updatesContainer) {
//         updatesContainer.scrollTop = updatesContainer.scrollHeight;
//       }
//     }
//   }, [updates, autoScroll]);

//   // Calculate sleep statistics
//   const calculateSleepStats = () => {
//     if (!selectedSession) return null;
    
//     const totalDuration = (selectedSession.endTime.getTime() - selectedSession.startTime.getTime()) / (60 * 60 * 1000); // hours
//     const stageDurations = selectedSession.sleepStages.reduce((acc, stage) => {
//       acc[stage.type] = (acc[stage.type] || 0) + stage.duration;
//       return acc;
//     }, {} as Record<string, number>);
    
//     return {
//       totalDuration: totalDuration.toFixed(1),
//       stageDurations,
//       efficiency: ((totalDuration - (stageDurations.awake || 0) / 60) / totalDuration * 100).toFixed(1),
//       numCycles: Math.ceil(selectedSession.sleepStages.length / 5)
//     };
//   };

//   const sleepStats = calculateSleepStats();

//   // Format data for EEGChart
//   const getChartData = () => {
//     if (!selectedSession) return [];
    
//     return selectedSession.timestamps.map((timestamp, index) => ({
//       timestamp,
//       value: selectedSession.channelData[index][selectedChannel],
//       channel: selectedChannel,
//       deviceId: selectedSession.deviceId,
//       quality: selectedSession.quality,
//       sleepStage: getSleepStageAtTime(selectedSession.sleepStages, timestamp)
//     }));
//   };

//   // Settings Screen Component
//   const SettingsScreen = () => (
//     <div className="settings-screen">
//       <div className="settings-header">
//         <h2>Sleep Session Settings</h2>
//         <button 
//           onClick={() => setShowSettings(false)}
//           className="close-settings-button"
//         >
//           ×
//         </button>
//       </div>
      
//       <div className="settings-content">
//         <div className="settings-group">
//           <h3>Display</h3>
//           <div className="setting-item">
//             <label>Theme</label>
//             <select 
//               value={settings.theme} 
//               onChange={(e) => updateSetting('theme', e.target.value)}
//             >
//               <option value="dark">Dark Mode</option>
//               <option value="light">Light Mode</option>
//               <option value="auto">Auto (System)</option>
//             </select>
//           </div>
          
//           <div className="setting-item">
//             <label>Time Format</label>
//             <select 
//               value={settings.timeFormat} 
//               onChange={(e) => updateSetting('timeFormat', e.target.value)}
//             >
//               <option value="24h">24-hour</option>
//               <option value="12h">12-hour (AM/PM)</option>
//             </select>
//           </div>
          
//           <div className="setting-item">
//             <label>Chart Type</label>
//             <select 
//               value={settings.chartType} 
//               onChange={(e) => updateSetting('chartType', e.target.value)}
//             >
//               <option value="waveform">Waveform</option>
//               <option value="area">Area Chart</option>
//               <option value="line">Line Chart</option>
//             </select>
//           </div>
//         </div>
        
//         <div className="settings-group">
//           <h3>Sleep Visualization</h3>
//           <div className="setting-item checkbox">
//             <label>
//               <input 
//                 type="checkbox" 
//                 checked={settings.showSleepStages} 
//                 onChange={(e) => updateSetting('showSleepStages', e.target.checked)}
//               />
//               Show Sleep Stages
//             </label>
//           </div>
          
//           <div className="setting-item checkbox">
//             <label>
//               <input 
//                 type="checkbox" 
//                 checked={settings.showBaseline} 
//                 onChange={(e) => updateSetting('showBaseline', e.target.checked)}
//               />
//               Show Baseline
//             </label>
//           </div>
          
//           <div className="setting-item">
//             <label>Y-Axis Range (µV)</label>
//             <div className="slider-container">
//               <input 
//                 type="range" 
//                 min="50" 
//                 max="200" 
//                 step="10"
//                 value={settings.yAxisRange} 
//                 onChange={(e) => updateSetting('yAxisRange', parseInt(e.target.value))}
//               />
//               <span className="slider-value">±{settings.yAxisRange} µV</span>
//             </div>
//           </div>
//         </div>
        
//         <div className="settings-group">
//           <h3>Sleep Stage Colors</h3>
//           <div className="sleep-stage-colors">
//             {Object.entries(settings.sleepStageColors).map(([stage, color]) => (
//               <div key={stage} className="color-picker-item">
//                 <label>{stage.charAt(0).toUpperCase() + stage.slice(1)} Sleep</label>
//                 <div className="color-picker-wrapper">
//                   <input 
//                     type="color" 
//                     value={color} 
//                     onChange={(e) => {
//                       updateSetting('sleepStageColors', {
//                         ...settings.sleepStageColors,
//                         [stage]: e.target.value
//                       });
//                     }}
//                   />
//                   <span 
//                     className="color-preview" 
//                     style={{ backgroundColor: color }}
//                   ></span>
//                 </div>
//               </div>
//             ))}
//           </div>
//         </div>
        
//         <div className="settings-group">
//           <h3>Data Management</h3>
//           <div className="setting-item checkbox">
//             <label>
//               <input 
//                 type="checkbox" 
//                 checked={settings.autoLoadDemoData} 
//                 onChange={(e) => updateSetting('autoLoadDemoData', e.target.checked)}
//               />
//               Auto-load demo data on login
//             </label>
//           </div>
          
//           <div className="setting-item">
//             <label>Data Retention (days)</label>
//             <div className="slider-container">
//               <input 
//                 type="range" 
//                 min="1" 
//                 max="90" 
//                 value={settings.dataRetention} 
//                 onChange={(e) => updateSetting('dataRetention', parseInt(e.target.value))}
//               />
//               <span className="slider-value">{settings.dataRetention} days</span>
//             </div>
//           </div>
//         </div>
        
//         <div className="settings-actions">
//           <button 
//             onClick={resetSettings}
//             className="reset-settings-button"
//           >
//             Reset to Defaults
//           </button>
//           <button 
//             onClick={() => setShowSettings(false)}
//             className="apply-settings-button"
//           >
//             Apply Settings
//           </button>
//         </div>
//       </div>
//     </div>
//   );

//   // Login Screen
//   if (!isAuthenticated) {
//     return (
//       <div className="login-container">
//         <div className="login-card">
//           <div className="login-header">
//             <h1>EEG Sleep Analyzer</h1>
//             <p>Whole Night Sleep Session Visualization</p>
//           </div>
          
//           <form onSubmit={handleLogin} className="login-form">
//             <div className="form-group">
//               <label htmlFor="username">Username</label>
//               <input
//                 id="username"
//                 type="text"
//                 value={username}
//                 onChange={(e) => setUsername(e.target.value)}
//                 placeholder="Enter username"
//                 required
//                 disabled={isLoading}
//               />
//             </div>
            
//             <div className="form-group">
//               <label htmlFor="password">Password</label>
//               <input
//                 id="password"
//                 type="password"
//                 value={password}
//                 onChange={(e) => setPassword(e.target.value)}
//                 placeholder="Enter password"
//                 required
//                 disabled={isLoading}
//               />
//             </div>
            
//             {loginError && (
//               <div className="error-message">
//                 {loginError}
//               </div>
//             )}
            
//             <button 
//               type="submit" 
//               className="login-button"
//               disabled={isLoading}
//             >
//               {isLoading ? 'Authenticating...' : 'Login to Sleep Analyzer'}
//             </button>
//           </form>
          
//           <div className="demo-credentials">
//             <p><strong>Demo Credentials:</strong></p>
//             <div className="credential-pair">
//               <span>Username: <code>demo</code></span>
//               <span>Password: <code>sleep123</code></span>
//             </div>
//             <div className="credential-pair">
//               <span>Username: <code>admin</code></span>
//               <span>Password: <code>admin123</code></span>
//             </div>
//           </div>
          
//           <div className="login-footer">
//             <p>Analyze whole night sleep EEG data with automatic sleep stage detection.</p>
//           </div>
//         </div>
//       </div>
//     );
//   }

//   // Main Application with Settings Screen Overlay
//   return (
//     <div className="app-container">
//       {/* Settings Screen Overlay */}
//       {showSettings && <SettingsScreen />}
      
//       {/* Header */}
//       <header className="app-header">
//         <div className="header-left">
//           <h1>EEG Sleep Analyzer</h1>
//           <p className="user-info">Logged in as: <strong>{username}</strong></p>
//         </div>
//         <div className="header-right">
//           <button 
//             onClick={() => setShowSettings(true)}
//             className="settings-button"
//             title="Settings"
//           >
//             ⚙️ Settings
//           </button>
//           <button 
//             onClick={handleLogout}
//             className="logout-button"
//           >
//             Logout
//           </button>
//         </div>
//       </header>

//       {/* Main Content */}
//       <main className="main-content">
//         {/* Session Selection Panel */}
//         <div className="session-panel">
//           <h2>Sleep Sessions</h2>
//           <div className="session-controls">
//             {sleepSessions.length > 0 ? (
//               <div className="session-list">
//                 {sleepSessions.map((session) => (
//                   <div 
//                     key={session.id} 
//                     className={`session-card ${selectedSession?.id === session.id ? 'active' : ''}`}
//                     onClick={() => setSelectedSession(session)}
//                   >
//                     <div className="session-date">
//                       {session.startTime.toLocaleDateString()}
//                     </div>
//                     <div className="session-time">
//                       {session.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - 
//                       {session.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
//                     </div>
//                     <div className="session-duration">
//                       {((session.endTime.getTime() - session.startTime.getTime()) / (60 * 60 * 1000)).toFixed(1)} hours
//                     </div>
//                     <div className={`session-quality quality-${session.quality}`}>
//                       {session.quality}
//                     </div>
//                   </div>
//                 ))}
//               </div>
//             ) : (
//               <div className="no-sessions">
//                 <p>No sleep sessions available.</p>
//                 <button 
//                   onClick={loadDemoSleepData}
//                   className="load-demo-button"
//                 >
//                   Load Demo Sleep Data
//                 </button>
//               </div>
//             )}
            
//             <div className="session-actions">
//               <button 
//                 onClick={clearData}
//                 className="clear-button"
//                 disabled={sleepSessions.length === 0}
//               >
//                 Clear All Sessions
//               </button>
//             </div>
//           </div>
//         </div>

//         {/* Sleep Statistics */}
//         {sleepStats && selectedSession && (
//           <div className="sleep-stats-panel">
//             <h2>Sleep Analysis</h2>
//             <div className="stats-grid">
//               <div className="stat-card">
//                 <div className="stat-value">{sleepStats.totalDuration}h</div>
//                 <div className="stat-label">Total Duration</div>
//               </div>
//               <div className="stat-card">
//                 <div className="stat-value">{sleepStats.efficiency}%</div>
//                 <div className="stat-label">Sleep Efficiency</div>
//               </div>
//               <div className="stat-card">
//                 <div className="stat-value">{sleepStats.numCycles}</div>
//                 <div className="stat-label">Sleep Cycles</div>
//               </div>
//               {Object.entries(sleepStats.stageDurations).map(([stage, duration]) => (
//                 <div key={stage} className="stat-card" style={{ 
//                   backgroundColor: `${settings.sleepStageColors[stage]}20`,
//                   borderColor: settings.sleepStageColors[stage]
//                 }}>
//                   <div className="stat-value" style={{ color: settings.sleepStageColors[stage] }}>
//                     {(duration / 60).toFixed(1)}h
//                   </div>
//                   <div className="stat-label" style={{ color: settings.sleepStageColors[stage] }}>
//                     {stage.charAt(0).toUpperCase() + stage.slice(1)}
//                   </div>
//                 </div>
//               ))}
//             </div>
//           </div>
//         )}

//         {/* EEG Sleep Session Visualization */}
//         <div className="visualization-panel">
//           <div className="panel-header">
//             <h2>Sleep EEG Visualization</h2>
//             <div className="visualization-controls">
//               <label className="checkbox-label">
//                 <input
//                   type="checkbox"
//                   checked={showRawData}
//                   onChange={(e) => setShowRawData(e.target.checked)}
//                 />
//                 Show Raw Data
//               </label>
              
//               <div className="select-group">
//                 <label htmlFor="timeView">View:</label>
//                 <select
//                   id="timeView"
//                   value={timeView}
//                   onChange={(e) => setTimeView(e.target.value as any)}
//                 >
//                   <option value="overview">Whole Night Overview</option>
//                   <option value="detailed">Detailed View</option>
//                   <option value="stage">Sleep Stage View</option>
//                 </select>
//               </div>
              
//               <div className="select-group">
//                 <label htmlFor="sleepStage">Sleep Stage:</label>
//                 <select
//                   id="sleepStage"
//                   value={selectedSleepStage}
//                   onChange={(e) => setSelectedSleepStage(e.target.value)}
//                   disabled={timeView !== 'stage'}
//                 >
//                   <option value="all">All Stages</option>
//                   <option value="awake">Awake</option>
//                   <option value="light">Light Sleep</option>
//                   <option value="deep">Deep Sleep</option>
//                   <option value="rem">REM Sleep</option>
//                 </select>
//               </div>
//             </div>
//           </div>
          
//           {selectedSession ? (
//             <div className="visualization-content">
//               {/* Recharts Graph for Sleep EEG */}
//               <div className="sleep-graph">
//                 <div className="graph-header">
//                   <h3>Sleep EEG - Channel {selectedChannel + 1}</h3>
//                   <span className="graph-scale">
//                     Whole Night Sleep Session
//                   </span>
//                 </div>
//                 <div className="graph-container">
//                   <EEGChart
//                     data={getChartData()}
//                     channel={selectedChannel}
//                     height={400}
//                     timeRange={8 * 60 * 60} // 8 hours in seconds
//                     color={settings.sleepStageColors.deep}
//                     showStats={true}
//                     sleepStages={selectedSession.sleepStages}
//                     showSleepStages={settings.showSleepStages}
//                     yAxisRange={settings.yAxisRange}
//                   />
//                 </div>
//                 <div className="graph-footer">
//                   <span>Time (Hours of Sleep)</span>
//                   <span>Amplitude (µV)</span>
//                 </div>
//               </div>
              
//               {/* Sleep Stage Timeline */}
//               {settings.showSleepStages && (
//                 <div className="sleep-stage-timeline">
//                   <h3>Sleep Stage Timeline</h3>
//                   <div className="timeline-container">
//                     {selectedSession.sleepStages.map((stage, index) => (
//                       <div 
//                         key={index}
//                         className="timeline-stage"
//                         style={{
//                           width: `${(stage.duration / (8 * 60)) * 100}%`,
//                           backgroundColor: settings.sleepStageColors[stage.type],
//                           color: 'white'
//                         }}
//                         title={`${stage.type}: ${stage.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${stage.endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} (${stage.duration.toFixed(1)} min)`}
//                       >
//                         {stage.type.charAt(0).toUpperCase()}
//                       </div>
//                     ))}
//                   </div>
//                   <div className="timeline-legend">
//                     {Object.entries(settings.sleepStageColors).map(([stage, color]) => (
//                       <div key={stage} className="legend-item">
//                         <span className="legend-color" style={{ backgroundColor: color }}></span>
//                         <span className="legend-label">{stage.charAt(0).toUpperCase() + stage.slice(1)}</span>
//                       </div>
//                     ))}
//                   </div>
//                 </div>
//               )}
              
//               {/* Raw Data Table */}
//               {showRawData && selectedSession && (
//                 <div className="raw-data-table">
//                   <h3>Sleep EEG Data Samples</h3>
//                   <div className="table-container">
//                     <table>
//                       <thead>
//                         <tr>
//                           <th>Time</th>
//                           <th>Channel 1 (µV)</th>
//                           <th>Sleep Stage</th>
//                           <th>Quality</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {selectedSession.timestamps.slice(0, 10).map((timestamp, index) => (
//                           <tr key={index}>
//                             <td>{timestamp.toLocaleTimeString('en-US', { 
//                               hour12: settings.timeFormat !== '24h',
//                               hour: '2-digit',
//                               minute: '2-digit'
//                             })}</td>
//                             <td>{selectedSession.channelData[index][0].toFixed(2)}</td>
//                             <td>
//                               <span className="stage-badge" style={{ 
//                                 backgroundColor: settings.sleepStageColors[getSleepStageAtTime(selectedSession.sleepStages, timestamp)]
//                               }}>
//                                 {getSleepStageAtTime(selectedSession.sleepStages, timestamp)}
//                               </span>
//                             </td>
//                             <td>
//                               <span className={`quality-badge quality-${selectedSession.quality}`}>
//                                 {selectedSession.quality}
//                               </span>
//                             </td>
//                           </tr>
//                         ))}
//                       </tbody>
//                     </table>
//                   </div>
//                 </div>
//               )}
//             </div>
//           ) : (
//             <div className="no-data-message">
//               <p>No sleep session selected. Select a session or load demo data.</p>
//             </div>
//           )}
//         </div>

//         {/* Updates Log */}
//         <div className="updates-panel">
//           <div className="panel-header">
//             <h2>Activity Log</h2>
//             <div className="log-controls">
//               <label className="checkbox-label">
//                 <input
//                   type="checkbox"
//                   checked={autoScroll}
//                   onChange={(e) => setAutoScroll(e.target.checked)}
//                 />
//                 Auto-scroll
//               </label>
//               <button 
//                 onClick={clearUpdates}
//                 className="clear-log-button"
//                 disabled={updates.length === 0}
//               >
//                 Clear Log
//               </button>
//             </div>
//           </div>
          
//           <div 
//             id="updates-log"
//             className="updates-log"
//           >
//             {updates.length === 0 ? (
//               <div className="empty-log">No activity yet.</div>
//             ) : (
//               updates.map((update, index) => (
//                 <div 
//                   key={index} 
//                   className={`update-entry ${update.includes('Error') ? 'error' : update.includes('loaded') ? 'success' : ''}`}
//                 >
//                   {update}
//                 </div>
//               ))
//             )}
//           </div>
//         </div>
//       </main>

//       {/* Footer */}
//       <footer className="app-footer">
//         <p>EEG Sleep Analyzer v2.0 • Whole Night Sleep Session Analysis • {new Date().getFullYear()}</p>
//         <p className="demo-notice">Using simulated sleep EEG data for demonstration purposes</p>
//       </footer>
//     </div>
//   );
// };

// export default EEGDataReader;