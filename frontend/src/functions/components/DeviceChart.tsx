// DeviceChart.tsx
import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { DataPoint } from '../dataTypes';
import { prepareChartData } from '../utils/chartUtils';

interface DeviceChartProps {
  title: string;
  data: DataPoint[];
  height?: number;
  showStats?: boolean;
  timeFormat?: 'short' | 'full';
}

const DeviceChart: React.FC<DeviceChartProps> = ({ 
  title, 
  data, 
  height = 300, 
  showStats = true,
  timeFormat = 'full'
}) => {
  if (!data || data.length === 0) {
    return (
      <div style={{
        backgroundColor: '#fff',
        padding: '1.5rem',
        borderRadius: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        border: '1px solid #e0e0e0',
        height: `${height}px`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#6c757d'
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '0.5rem', color: '#000' }}></div>
          <h4 style={{ margin: 0 }}>No Data Available</h4>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#000' }}>
            {title}
          </p>
        </div>
      </div>
    );
  }

  const chartData = prepareChartData(data);
  
  // Calculate basic statistics
  const values = chartData.map(d => d.value).filter(v => !isNaN(v));
  const min = values.length > 0 ? Math.min(...values) : 0;
  const max = values.length > 0 ? Math.max(...values) : 0;
  const avg = values.length > 0 ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(2) : '0';
  
  // Determine source color
  const isCSV = data[0]?.source === 'csv';
  const isModbus = data[0]?.dataType === 'modbus';
  const lineColor = isCSV ? '#28a745' : (isModbus ? '#17a2b8' : '#007bff');
  
  // Determine device type
  const deviceTypes = Array.from(new Set(chartData.map(d => d.type)));
  const deviceTypeStr = deviceTypes.join(', ');

  return (
    <div style={{
      backgroundColor: '#c9c8c8ff',
      padding: '1.5rem',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      border: '1px solid #a2a0a0ff',
      height: `${height}px`,
      display: 'flex',
      flexDirection: 'column'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: '1rem',
        flexShrink: 0
      }}>
        <div>
          <h3 style={{ 
            margin: 0, 
            fontSize: '1.1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            color: '#000'
          }}>
            {/* Display the Pod/ CSV file name */}
            {title} 
          </h3>
          <div style={{ 
            fontSize: '0.8rem', 
            color: '#6c757d', 
            marginTop: '0.25rem',
            display: 'flex',
            gap: '1rem',
            flexWrap: 'wrap'
          }}>
            <span style={{
              padding: '0.125rem 0.5rem',
              backgroundColor: isCSV ? '#d4edda' : '#d1ecf1',
              borderRadius: '4px',
              border: `1px solid ${isCSV ? '#c3e6cb' : '#bee5eb'}`
            }}>
              {isCSV ? 'CSV Simulation' : 'Solid Pod'}
            </span>
            <span style={{
              padding: '0.125rem 0.5rem',
              backgroundColor: '#e2e3e5',
              borderRadius: '4px',
              border: '1px solid #d6d8db'
            }}>
              {deviceTypeStr}
            </span>
            <span>
              {data.length} data points
            </span>
          </div>
        </div>
        
        {showStats && (
          <div style={{
            textAlign: 'right',
            fontSize: '0.85rem',
            backgroundColor: '#464748ff',
            padding: '0.5rem',
            borderRadius: '4px',
            border: '1px solid #7a7b7cff'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
              <div>
                <div style={{ fontWeight: 'bold', color: '#dc3545' }}>Min</div>
                <div>{min}</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: '#28a745' }}>Avg</div>
                <div>{avg}</div>
              </div>
              <div>
                <div style={{ fontWeight: 'bold', color: '#007bff' }}>Max</div>
                <div>{max}</div>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e9ecef" />
            <XAxis 
              dataKey="time" 
              tick={{ fontSize: timeFormat === 'short' ? 10 : 11 }}
              interval="preserveStartEnd"
              stroke="#6c757d"
            />
            <YAxis 
              domain={['auto', 'auto']} 
              stroke="#6c757d"
              tick={{ fontSize: 11 }}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white',
                border: '1px solid #7d7d7eff',
                borderRadius: '4px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                padding: '0.75rem'
              }}
              labelStyle={{ 
                fontWeight: 'bold', 
                marginBottom: '0.5rem',
                color: '#495057'
              }}
              formatter={(value: any) => [
                <span key="value" style={{ fontWeight: 'bold', color: lineColor }}>
                  {value}
                </span>, 
                'Value'
              ]}
              labelFormatter={(label) => `Time: ${label}`}
            />
            <Legend 
              wrapperStyle={{ 
                paddingTop: '0.5rem',
                fontSize: '0.85rem'
              }}
            />
            
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke={lineColor}
              strokeWidth={2}
              activeDot={{ 
                r: 6, 
                stroke: 'white', 
                strokeWidth: 2 
              }} 
              name="Value"
              connectNulls
              dot={{ r: 2 }}
            />
            
            {/* Optional: Show different line types for mixed data */}
            {deviceTypes.length > 1 && (
              <>
                {deviceTypes.includes('modbus') && (
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#17a2b8"
                    strokeWidth={1.5}
                    strokeDasharray="3 3"
                    name="Modbus"
                    connectNulls
                    data={chartData.filter(d => d.type === 'modbus')}
                  />
                )}
                {deviceTypes.includes('slider') && (
                  <Line 
                    type="monotone" 
                    dataKey="value" 
                    stroke="#ffc107"
                    strokeWidth={1.5}
                    name="Slider"
                    connectNulls
                    data={chartData.filter(d => d.type === 'slider')}
                  />
                )}
              </>
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      
      {/* Footer */}
      <div style={{
        marginTop: '0.75rem',
        fontSize: '0.75rem',
        color: '#6c757d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexShrink: 0
      }}>
        <div>
          {chartData.length > 0 && (
            <>
              First: {chartData[0].originalTime.split(',')[1].trim()} • 
              Last: {chartData[chartData.length - 1].originalTime.split(',')[1].trim()}
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isCSV && <span> CSV</span>}
          {deviceTypes.includes('modbus') && <span> Modbus</span>}
          {deviceTypes.includes('slider') && <span> Slider</span>}
        </div>
      </div>
    </div>
  );
};

export default DeviceChart;