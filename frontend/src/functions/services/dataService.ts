import { getFile } from '@inrupt/solid-client';
import { getDefaultSession } from '@inrupt/solid-client-authn-browser';
import { parseModbusData } from '../parsers/modbusParser';
import { parseSliderData } from '../parsers/sliderParser';
import { DataPoint, ModbusData, SliderData, isModbusData, isSliderData } from '../dataTypes';

const baseURI = import.meta.env.VITE_BASE_URI;

// Fetches data from Solid Pod using Solid client library
// User can choose between different data sources 
// Handles authentication and file retrieval

export class DataService {
  private session = getDefaultSession();
  private csvData: DataPoint[] = [];

  async fetchModbusData(podName: string): Promise<ModbusData[]> {
    try {
      const modbusFile = await getFile(
        `${baseURI}/${podName}/modbus/`,
        { fetch: this.session.fetch }
      );
      
      if (modbusFile) {
        const content = await modbusFile.text();
        return parseModbusData(content);
      }
    } catch (modbusError) {
      console.error('Error fetching modbus data:', modbusError);
      throw modbusError;
    }
    
    return [];
  }

  async fetchSliderData(podName: string): Promise<SliderData[]> {
    try {
      const sliderFile = await getFile(
        `${baseURI}/${podName}/modbus`,
        { fetch: this.session.fetch }
      );
      
      if (sliderFile) {
        const content = await sliderFile.text();
        return parseSliderData(content);
      }
    } catch (sliderError) {
      console.error('Error fetching slider data:', sliderError);
      throw sliderError;
    }
    
    return [];
  }

  async fetchAllData(podName: string, dataType: 'modbus' | 'slider' | 'both'): Promise<DataPoint[]> {
    const allData: DataPoint[] = [];
    
    if (dataType === 'both' || dataType === 'modbus') {
      try {
        const modbusData = await this.fetchModbusData(podName);
        allData.push(...modbusData);
      } catch (error) {
        console.error('Failed to fetch modbus data:', error);
        // Don't throw - continue to try fetching slider data
      }
    }

    if (dataType === 'both' || dataType === 'slider') {
      try {
        const sliderData = await this.fetchSliderData(podName);
        allData.push(...sliderData);
      } catch (error) {
        console.error('Failed to fetch slider data:', error);
      }
    }

    // Add CSV data if loaded
    if (this.csvData.length > 0) {
      const filteredCSVData = this.csvData.filter(item => {
        if (dataType === 'both') return true;
        return item.dataType === dataType;
      });
      allData.push(...filteredCSVData);
    }

    return allData;
  }

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

  getDataSummary(): { total: number, modbus: number, slider: number, csv: number } {
    return {
      total: this.csvData.length,
      modbus: this.csvData.filter(d => d.dataType === 'modbus').length,
      slider: this.csvData.filter(d => d.dataType === 'slider').length,
      csv: this.csvData.length
    };
  }

  // Helper method to get filtered CSV data
  getFilteredCSVData(dataType: 'modbus' | 'slider' | 'both'): DataPoint[] {
    if (dataType === 'both') return this.csvData;
    return this.csvData.filter(item => item.dataType === dataType);
  }
}