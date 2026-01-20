// Definitions of TypeScript interfaces for data structures
// ModbusData: Structure for potentiometer readings from RDF
// SliderData: Structure for slider values from text format
// DataPoint: Union type for both data types
// ChartDataPoint: Formatted data for Recharts visualization

// Base interface for all data points
export interface BaseDataPoint {
  dataType: 'modbus' | 'slider';
  value: number;
  timestamp: Date;
  deviceId?: string; // Optional property
  source?: 'solid-pod' | 'csv' | 'mqtt';
}

// Data format that comes from RDF/Modbus readings
export interface ModbusData extends BaseDataPoint {
  dataType: 'modbus';
  register: number;
  function: string;
  accessed?: number; // Unix timestamp from RDF
}

// Data format that this web portal sends to the pod
export interface SliderData extends BaseDataPoint {
  dataType: 'slider';
  sliderId: string;
  rawMessage?: string;
}

// Union type for both data types
export type DataPoint = ModbusData | SliderData;

// Formatted data for Recharts visualization
export interface ChartDataPoint {
  time: string;                    // Formatted time string for display
  value: number;                   // Numeric value for the chart
  name: string;                    // Display name (e.g., "Register 0" or "Slider 1")
  type: 'modbus' | 'slider';      // Original data type
  deviceId: string;               // Device identifier
  source: string;                 // Data source ('solid-pod', 'csv', 'mqtt')
  fullTimestamp: Date;            // Original timestamp
  originalTime: string;           // Formatted timestamp for tooltips
  // Optional fields based on data type
  register?: number;              // For modbus data
  sliderId?: string;              // For slider data
  function?: string;              // For modbus function
}

// Type guards for runtime type checking
export function isModbusData(data: DataPoint): data is ModbusData {
  return data.dataType === 'modbus';
}

export function isSliderData(data: DataPoint): data is SliderData {
  return data.dataType === 'slider';
}

// Helper function to extract device-specific properties
export function getDataPointProperties(data: DataPoint): {
  deviceName: string;
  typeLabel: string;
  detail: string;
} {
  if (isModbusData(data)) {
    return {
      deviceName: data.deviceId || 'Unknown Device',
      typeLabel: 'Modbus Register',
      detail: `Register ${data.register} - ${data.function}`
    };
  } else {
    return {
      deviceName: data.deviceId || 'Unknown Device',
      typeLabel: 'Slider',
      detail: `Slider ${data.sliderId}`
    };
  }
}

// Potentially add DNP3, other SCADA protocols etc.