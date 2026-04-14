import { DataPoint, ModbusData, SliderData } from '../dataTypes';

/**
 * Local-only data loader used by older tooling/UI pieces.
 *
 * Context:
 * - This service predates the DreamRT live BLE streaming flow.
 * - It reads a CSV where each row is either Modbus-like telemetry or slider telemetry.
 * - The "Solid Pod" (remote storage) integration was removed; this is now strictly `fetch(filepath)`.
 *
 * CSV format (header + rows):
 *   timestamp,deviceId,dataType,registerOrId,value,functionOrRawMessage
 *
 * Where:
 * - dataType = "modbus" → parsed into `ModbusData`
 * - dataType = "slider" → parsed into `SliderData`
 */

export class DataService {
  private csvData: DataPoint[] = [];

  async loadCSVData(filepath: string): Promise<DataPoint[]> {
    try {
      const response = await fetch(filepath);
      const text = await response.text();

      const lines = text.split('\n').slice(1); // Skip header
      const dataPoints: DataPoint[] = [];

      lines.forEach((line) => {
        if (line.trim()) {
          const columns = line.split(',');
          if (columns.length < 6) return; // Skip incomplete lines

          const [timestamp, deviceId, dataType, registerStr, valueStr, func] = columns;

          // Create base data point
          const baseDataPoint = {
            value: parseInt(valueStr) || 0,
            timestamp: new Date(timestamp),
            deviceId: deviceId,
            source: 'csv' as const
          };

          let dataPoint: DataPoint;

          if (dataType === 'modbus') {
            dataPoint = {
              ...baseDataPoint,
              dataType: 'modbus' as const,
              register: parseInt(registerStr) || 0,
              function: func || 'READ_HOLDING_REGISTER'
            } as ModbusData;
          } else if (dataType === 'slider') {
            dataPoint = {
              ...baseDataPoint,
              dataType: 'slider' as const,
              sliderId: registerStr || `potentiometer_${deviceId.split('-').pop()}`,
              rawMessage: func || ''
            } as SliderData;
          } else {
            console.warn(`Unknown data type in CSV: ${dataType}`);
            return;
          }

          dataPoints.push(dataPoint);
        }
      });

      this.csvData = dataPoints;
      console.log(`Loaded ${dataPoints.length} data points from CSV`);
      return dataPoints;
    } catch (error) {
      console.error('Error loading CSV data:', error);
      return [];
    }
  }

  getCSVData(): DataPoint[] {
    return this.csvData;
  }

  clearCSVData(): void {
    this.csvData = [];
  }

  getDataSummary(): { total: number; modbus: number; slider: number; csv: number } {
    return {
      total: this.csvData.length,
      modbus: this.csvData.filter((d) => d.dataType === 'modbus').length,
      slider: this.csvData.filter((d) => d.dataType === 'slider').length,
      csv: this.csvData.length
    };
  }

  getFilteredCSVData(dataType: 'modbus' | 'slider' | 'both'): DataPoint[] {
    if (dataType === 'both') return this.csvData;
    return this.csvData.filter((item) => item.dataType === dataType);
  }
}
