// This is the main application that manages the state:
// connection, data, UI preferences

// Coordinates between services and display components

// Timestamps show actual data collection time
// Data updates automatically via WebSocket

import React, { useState, useEffect, useRef } from 'react';
import { getDefaultSession, handleIncomingRedirect } from '@inrupt/solid-client-authn-browser';
import { useNavigate } from 'react-router-dom';

import { DataPoint } from '../dataTypes';
import { WebSocketService } from '../services/websocketService';
import { DataService } from '../services/dataService';
import { prepareChartDataByDevice, groupDataBySource } from '../utils/chartUtils';
import DataTable from './DataTable';
import UpdatesLog from './UpdatesLog';
import LoginSection from './LoginSection';
import DebugReader from '../parsers/DebugReader';
import { DebugService } from '../services/debugService';
import DeviceChart from './DeviceChart';


const baseURI = import.meta.env.VITE_BASE_URI;

const SolidPodReader: React.FC = () => {
  const session = getDefaultSession();
  const navigate = useNavigate();
  const websocketServiceRef = useRef<WebSocketService | null>(null);
  const dataServiceRef = useRef<DataService | null>(null);
  
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [podName, setPodName] = useState<string>('');
  const [allData, setAllData] = useState<DataPoint[]>([]);
  const [updates, setUpdates] = useState<string[]>([]);
  const [dataType, setDataType] = useState<'modbus' | 'slider' | 'both'>('both');
  
  // CSV State
  const [showCSVData, setShowCSVData] = useState<boolean>(true);
  const [csvFile, setCsvFile] = useState<string>('/esp32_simulation_24h.csv');
  const [csvData, setCsvData] = useState<DataPoint[]>([]);
  const [csvLoaded, setCsvLoaded] = useState<boolean>(false);

  // Chart Display Options
  const [groupingMethod, setGroupingMethod] = useState<'device' | 'source' | 'combined'>('device');
  const [chartHeight, setChartHeight] = useState<number>(250);
  const [showStats, setShowStats] = useState<boolean>(true);
  const [compactView, setCompactView] = useState<boolean>(false);

  const debugPodAccess = async () => {
    if (!podName) return;
    
    const debugService = new DebugService();
    await debugService.debugPodStructure(podName);
  };

  // Initialize services
  useEffect(() => {
    if (!websocketServiceRef.current) {
      websocketServiceRef.current = new WebSocketService();
    }
    if (!dataServiceRef.current) {
      dataServiceRef.current = new DataService();
    }
  }, []);

  const loginToSolid = async (): Promise<void> => {
    await session.login({
      oidcIssuer: baseURI,
      redirectUrl: window.location.href,
      clientName: 'ESP32 Reader',
    });
  };

  const logoutFromSolid = async (): Promise<void> => {
    if (websocketServiceRef.current) {
      websocketServiceRef.current.disconnect();
    }
    
    await session.logout();
    setIsConnected(false);
    setAllData([]);
    setPodName('');
    setCsvData([]);
    setCsvLoaded(false);
    addUpdate('Logged out successfully');
  };

  const addUpdate = (message: string) => {
    setUpdates(prev => [...prev, `[${new Date().toLocaleTimeString()}]: ${message}`]);
  };

  const fetchData = async (): Promise<void> => {
    if (!podName || !dataServiceRef.current) return;
    
    try {
      const newData = await dataServiceRef.current.fetchAllData(podName, dataType);
      
      if (newData.length > 0) {
        setAllData(prev => {
          // Combine and deduplicate data
          const combined = [...prev];
          newData.forEach(newPoint => {
            const exists = combined.some(existing => 
              existing.dataType === newPoint.dataType &&
              existing.timestamp.getTime() === newPoint.timestamp.getTime() &&
              (existing as any).value === (newPoint as any).value &&
              existing.source === newPoint.source
            );
            if (!exists) {
              combined.push(newPoint);
            }
          });
          
          // Keep only the last 500 data points for performance
          return combined.slice(-500);
        });

        // Add updates for new data
        newData.forEach(data => {
          if (data.source === 'csv') return; // Don't add CSV updates
          
          if (data.dataType === 'modbus') {
            const modbusData = data as any;
            addUpdate(`Modbus - Register ${modbusData.register} - ${modbusData.function}: ${modbusData.value} (${data.timestamp.toLocaleString()})`);
          } else {
            const sliderData = data as any;
            addUpdate(`Slider update from ${sliderData.timestamp.toLocaleTimeString()} - Value: ${sliderData.value}`);
          }
        });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      addUpdate(`Error fetching data: ${error}`);
    }
  };

  const loadCSVData = async (): Promise<void> => {
    if (!dataServiceRef.current) return;
    
    try {
      const data = await dataServiceRef.current.loadCSVData(csvFile);
      setCsvData(data);
      setCsvLoaded(true);
      addUpdate(`Loaded ${data.length} data points from CSV: ${csvFile}`);
      
      // Refresh data display
      await fetchData();
    } catch (error) {
      console.error('Error loading CSV:', error);
      addUpdate(`Error loading CSV: ${error}`);
    }
  };

  const clearCSVData = (): void => {
    if (dataServiceRef.current) {
      dataServiceRef.current.clearCSVData();
      setCsvData([]);
      setCsvLoaded(false);
      addUpdate('Cleared CSV data');
      
      // Refresh data display
      fetchData();
    }
  };

  const goToWriter = (): void => {
    navigate('/');
  };

  // Load CSV data on component mount
  useEffect(() => {
    loadCSVData();
  }, []);

  useEffect(() => {
    const handleSessionState = async () => {
      await handleIncomingRedirect({ restorePreviousSession: true });
      setIsConnected(session.info.isLoggedIn);
      setIsLoading(false);
      
      if (session.info.isLoggedIn) {
        addUpdate(`Logged in as ${session.info.webId || 'user'}`);
      }
    };

    handleSessionState();
  }, [session]);

  useEffect(() => {
    if (isConnected && podName && websocketServiceRef.current) {
      const subscribeToNotifications = async () => {
        try {
          const sliderTopic = `${baseURI}/${podName}/modbus`;
          
          await websocketServiceRef.current!.connect(sliderTopic, async () => {
            await fetchData();
          });
          
          addUpdate('WebSocket connected to slider data');
        } catch (error) {
          console.error("Failed to establish WebSocket connection:", error);
          addUpdate('Failed to establish WebSocket connection');
        }
      };

      // Initial data fetch
      fetchData();
      
      // Set up WebSocket subscription
      subscribeToNotifications();
    }

    return () => {
      if (websocketServiceRef.current) {
        websocketServiceRef.current.disconnect();
      }
    };
  }, [isConnected, podName, dataType]);

  const clearUpdates = (): void => {
    setUpdates([]);
  };

  // Filter data based on selected data type and CSV toggle
  const filteredData = allData.filter(item => {
    if (dataType === 'both') {
      return showCSVData ? true : item.source !== 'csv';
    }
    return item.dataType === dataType && (showCSVData ? true : item.source !== 'csv');
  });

  // Prepare chart data based on grouping method
  const getChartData = () => {
    if (groupingMethod === 'device') {
      return prepareChartDataByDevice(filteredData);
    } else if (groupingMethod === 'source') {
      return groupDataBySource(filteredData);
    } else {
      // Combined view - single chart with all data
      return { 'All Data': filteredData };
    }
  };

  const chartData = getChartData();
  const chartGroups = Object.keys(chartData);

  if (isLoading) {
    return <h2>Loading...</h2>;
  }

  if (!isConnected) {
    return <LoginSection onLogin={loginToSolid} />;
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1>Solid Pod Reader</h1>
        <button 
          onClick={goToWriter}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#2196F3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
        >
          Go to Writer
        </button>
      </div>
      
      <div>
        {/* Header Controls */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <h2>Real-time Data Reader</h2>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={clearUpdates}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#6c757d',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Clear Updates
            </button>
            <button 
              onClick={logoutFromSolid}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#dc3545',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Logout
            </button>
          </div>
        </div>
        
        {/* CSV Control Panel */}
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          backgroundColor: '#9e9fa0ff', 
          borderRadius: '8px',
          border: '1px solid #898989ff'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '1rem', color: '#495057' }}>
            CSV Simulation Controls
          </h3>
          
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={showCSVData}
                onChange={(e) => setShowCSVData(e.target.checked)}
                style={{ marginRight: '0.5rem' }}
              />
              Show CSV Simulation Data
            </label>
            
            <div style={{ flex: 1, minWidth: '300px' }}>
              <input
                type="text"
                value={csvFile}
                onChange={(e) => setCsvFile(e.target.value)}
                placeholder="Path to CSV file (e.g., /data/esp32_simulation.csv)"
                style={{ 
                  width: '100%',
                  padding: '0.5rem',
                  border: '1px solid #101010ff',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  color: 'black' // Text is otherwise white/invisible
                }}
              />
            </div>
            
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button 
                onClick={loadCSVData}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#28a745',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Load CSV
              </button>
              
              <button 
                onClick={clearCSVData}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#dc3545',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Clear CSV
              </button>
            </div>
          </div>
          
          {csvLoaded && (
            <div style={{ 
              marginTop: '1rem', 
              padding: '0.75rem',
              backgroundColor: '#5a5c5aff',
              borderRadius: '4px',
              fontSize: '0.9rem',
              border: '1px solid #585a58ff'
            }}>
              CSV Loaded: <strong>{csvData.length}</strong> data points from <code>{csvFile}</code>
              <br />
              <small style={{ color: '#25933eff' }}>
                Devices: {Array.from(new Set(csvData.map(d => d.deviceId))).join(', ')} • 
                Modbus: {csvData.filter(d => d.dataType === 'modbus').length} • 
                Slider: {csvData.filter(d => d.dataType === 'slider').length}
              </small>
            </div>
          )}
        </div>
        
        {/* Data Configuration Panel */}
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          backgroundColor: '#4a4b4cff', 
          borderRadius: '8px',
          border: '1px solid #212122ff'
        }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2rem', alignItems: 'center' }}>
            {/* Pod Name Input */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Pod Name
              </label>
              <input
                type="text"
                value={podName}
                onChange={(e) => setPodName(e.target.value)}
                placeholder="Enter pod name (e.g., Char)"
                style={{ 
                  padding: '0.5rem',
                  border: '1px solid #535354ff',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  width: '200px',
                  color: 'black'
                }}
              />
            </div>

            {/* Data Type Selector */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Data Type
              </label>
              <select
                value={dataType}
                onChange={(e) => setDataType(e.target.value as 'modbus' | 'slider' | 'both')}
                style={{ 
                  padding: '0.5rem',
                  border: '1px solid #66696cff',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  width: '150px',
                  color: 'black'
                }}
              >
                <option value="both">Both Modbus & Slider</option>
                <option value="modbus">Modbus Only</option>
                <option value="slider">Slider Only</option>
              </select>
            </div>

            {/* Chart Display Options */}
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                Chart View
              </label>
              <select
                value={groupingMethod}
                onChange={(e) => setGroupingMethod(e.target.value as 'device' | 'source' | 'combined')}
                style={{ 
                  padding: '0.5rem',
                  border: '1px solid #888a8dff',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                  width: '150px',
                  color: 'black'
                }}
              >
                <option value="device">By Device</option>
                <option value="source">By Source</option>
                <option value="combined">Combined View</option>
              </select>
            </div>
          </div>

          {/* Chart Settings */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginTop: '1rem', alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={showStats}
                onChange={(e) => setShowStats(e.target.checked)}
              />
              Show Statistics
            </label>
            
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input
                type="checkbox"
                checked={compactView}
                onChange={(e) => setCompactView(e.target.checked)}
              />
              Compact View
            </label>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <label style={{ whiteSpace: 'nowrap' }}>Chart Height:</label>
              <input
                type="range"
                min="150"
                max="400"
                step="50"
                value={chartHeight}
                onChange={(e) => setChartHeight(parseInt(e.target.value))}
                style={{ width: '100px' }}
              />
              <span>{chartHeight}px</span>
            </div>
          </div>
        </div>

        {/* Data Summary */}
        <div style={{ 
          marginBottom: '1.5rem', 
          padding: '1rem', 
          backgroundColor: '#7a7b7cff', 
          borderRadius: '8px',
          border: '1px solid #3f3f3fff'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '1.1rem' }}>Data Summary</strong>
              <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1.5rem' }}>
                <div>
                  <span style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#007bff' }}>
                    {filteredData.length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>Total Points</div>
                </div>
                <div>
                  <span style={{ fontSize: '1.2rem', color: '#17a2b8' }}>
                    {filteredData.filter(d => d.dataType === 'modbus').length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>Modbus</div>
                </div>
                <div>
                  <span style={{ fontSize: '1.2rem', color: '#28a745' }}>
                    {filteredData.filter(d => d.dataType === 'slider').length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>Slider</div>
                </div>
                {csvLoaded && (
                  <div>
                    <span style={{ fontSize: '1.2rem', color: '#ffc107' }}>
                      {csvData.length}
                    </span>
                    <div style={{ fontSize: '0.9rem' }}>CSV Data</div>
                  </div>
                )}
                <div>
                  <span style={{ fontSize: '1.2rem', color: '#6f42c1' }}>
                    {chartGroups.length}
                  </span>
                  <div style={{ fontSize: '0.9rem' }}>Charts</div>
                </div>
              </div>
            </div>
            <div style={{ fontSize: '0.85rem', color: '#e1e3e4ff', maxWidth: '300px' }}>
              {showCSVData ? 'Showing Solid Pod + CSV Simulation data' : 'Showing Solid Pod data only'}
            </div>
          </div>
        </div>

        {/* Charts Section */}
        {chartGroups.length > 0 ? (
          <div style={{ marginBottom: '2rem' }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem'
            }}>
              <h2 style={{ margin: 0 }}>
                {groupingMethod === 'device' ? 'Device Charts' : 
                 groupingMethod === 'source' ? 'Data Source Charts' : 
                 'Combined Data View'}
              </h2>
              <div style={{ fontSize: '0.9rem', color: '#6c757d' }}>
                Displaying {chartGroups.length} chart{chartGroups.length !== 1 ? 's' : ''}
              </div>
            </div>
            
            <div style={{
              display: 'grid',
              gridTemplateColumns: compactView ? 'repeat(auto-fill, minmax(350px, 1fr))' : 'repeat(auto-fill, minmax(500px, 1fr))',
              gap: compactView ? '1rem' : '1.5rem'
            }}>
              {chartGroups.map((group) => (
                <DeviceChart
                  key={group}
                  title={group}
                  data={chartData[group]}
                  height={chartHeight}
                  showStats={showStats}
                  timeFormat={compactView ? 'short' : 'full'}
                />
              ))}
            </div>
          </div>
        ) : (
          <div style={{
            marginBottom: '2rem',
            padding: '3rem',
            backgroundColor: '#f8f9fa',
            borderRadius: '8px',
            border: '2px dashed #dee2e6',
            textAlign: 'center',
          }}>
            <h3 style={{ color: '#6c757d', marginBottom: '1rem' }}>
              No Data Available
            </h3>
            <p style={{ color: '#6c757d', marginBottom: '1rem' }}>
              {podName ? 'Waiting for data from the selected pod...' : 'Enter a pod name to start fetching data.'}
            </p>
            {podName && (
              <button 
                onClick={fetchData}
                style={{
                  padding: '0.5rem 1.5rem',
                  backgroundColor: '#007bff',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '1rem'
                }}
              >
                Refresh Data
              </button>
            )}
          </div>
        )}

        {/* Data Table */}
        {filteredData.length > 0 && (
          <div style={{ marginBottom: '2rem' }}>
            <h2>Raw Data Table</h2>
            <DataTable data={filteredData} />
          </div>
        )}
        
        {/* Updates Log */}
        <div style={{ marginBottom: '2rem' }}>
          <UpdatesLog updates={updates} />
        </div>
        
        {/* Debug the parser */}
        {isConnected && podName && (
          <DebugReader podName={podName} />
        )}
      </div>
    </div>
  );
};

export default SolidPodReader;