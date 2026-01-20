import React from 'react';
import { DataPoint } from './dataTypes';

interface DataTableProps {
  data: DataPoint[];
}

const DataTable: React.FC<DataTableProps> = ({ data }) => {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <h3>Recent Data Points</h3>
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: '#928c8cff', position: 'sticky', top: 0 }}>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Time</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Type</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>ID/Register</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Function</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Value</th>
              <th style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', textAlign: 'left' }}>Raw Message</th>
            </tr>
          </thead>
          
          <tbody>
            {[...data].reverse().map((data, index) => (
              <tr key={index} style={{ 
                backgroundColor: data.dataType === 'modbus' ? '#84878aff' : '#666465ff' 
              }}>
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff' }}>
                  {data.timestamp.toLocaleString()}
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff' }}>
                  <span style={{ 
                    padding: '0.2rem 0.5rem', 
                    borderRadius: '4px', 
                    fontSize: '0.8rem',
                    backgroundColor: data.dataType === 'modbus' ? '#e3f2fd' : '#fce4ec',
                    color: data.dataType === 'modbus' ? '#1565c0' : '#c2185b'
                  }}>
                    {data.dataType}
                  </span>
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff' }}>
                  {data.dataType === 'modbus' 
                    ? (data as any).register
                    : (data as any).sliderId
                  }
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff' }}>
                  {data.dataType === 'modbus' 
                    ? (data as any).function
                    : 'N/A'
                  }
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', fontWeight: 'bold' }}>
                  {data.value}
                </td>
                
                <td style={{ padding: '0.5rem', border: '1px solid #5e5b5bff', fontSize: '0.8rem', color: '#c6c1c1ff' }}>
                  {data.dataType === 'slider' 
                    ? (data as any).rawMessage
                    : `Unix: ${(data as any).accessed}`
                  }
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DataTable;