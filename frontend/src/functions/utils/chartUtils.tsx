import { DataPoint, ChartDataPoint } from '../dataTypes';

// Transforms raw data for chart display
// Formats tooltips and axis labels
// Prepares data for Recharts library

export const prepareChartData = (data: DataPoint[]): ChartDataPoint[] => {
  const sortedData = [...data].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return sortedData.map(data => ({
    time: data.timestamp.toLocaleTimeString(),
    value: data.value,
    name: data.dataType === 'modbus' 
      ? `Register ${(data as any).register}` 
      : `Slider ${(data as any).sliderId}`,
    type: data.dataType,
    deviceId: data.deviceId || 'unknown',
    source: data.source || 'solid-pod',
    fullTimestamp: data.timestamp,
    originalTime: data.timestamp.toLocaleString(),
    register: (data as any).register,
    sliderId: (data as any).sliderId,
    function: (data as any).function
  }));
};

export const formatTooltip = (value: number, name: string, props: any) => {
  if (props.payload && props.payload[0]) {
    const data = props.payload[0].payload;
    return [
      <div key="tooltip">
        <p><strong>Value:</strong> {value}</p>
        <p><strong>Time:</strong> {data.originalTime}</p>
        <p><strong>Device:</strong> {data.deviceId}</p>
        <p><strong>Source:</strong> {data.source === 'csv' ? 'CSV Simulation' : 'Solid Pod'}</p>
        <p><strong>Type:</strong> {data.type}</p>
        {data.type === 'modbus' && (
          <p><strong>Register:</strong> {data.register}</p>
        )}
        {data.type === 'slider' && (
          <p><strong>Slider ID:</strong> {data.sliderId}</p>
        )}
      </div>
    ];
  }
  return [value, name];
};

export const prepareChartDataByDevice = (data: DataPoint[]): Record<string, DataPoint[]> => {
  const groupedData: Record<string, DataPoint[]> = {};
  
  data.forEach(item => {
    const device = item.deviceId || 'unknown';
    if (!groupedData[device]) {
      groupedData[device] = [];
    }
    groupedData[device].push(item);
  });
  
  // Sort each device's data by time
  Object.keys(groupedData).forEach(device => {
    groupedData[device].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  });
  
  return groupedData;
};

export const groupDataBySource = (data: DataPoint[]): Record<string, DataPoint[]> => {
  const groupedData: Record<string, DataPoint[]> = {};
  
  data.forEach(item => {
    const source = item.source === 'csv' 
      ? `CSV: ${item.deviceId || 'unknown'}` 
      : `Solid Pod: ${item.deviceId || 'unknown'}`;
    if (!groupedData[source]) {
      groupedData[source] = [];
    }
    groupedData[source].push(item);
  });
  
  // Sort each source's data by time
  Object.keys(groupedData).forEach(source => {
    groupedData[source].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  });
  
  return groupedData;
};
