import React from 'react';
import { getFile } from '@inrupt/solid-client';
import { getDefaultSession } from '@inrupt/solid-client-authn-browser';

const baseURI = import.meta.env.VITE_BASE_URI;

// Use to debug what's being read in from the Pod, and where a disconnect is happening

const DebugReader: React.FC<{ podName: string }> = ({ podName }) => {
  const [rawContent, setRawContent] = React.useState<string>('');
  
  const fetchRawData = async () => {
    try {
      const session = getDefaultSession();
      const url = `${baseURI}/${podName}/modbus/`; // Ideally unhardcode file path eventually
      console.log('Fetching from:', url);
      
      const file = await getFile(url, { fetch: session.fetch });
      if (file) {
        const content = await file.text();
        setRawContent(content);
        console.log('Raw content:', content);
      }
    } catch (error) {
      console.error('Debug fetch error:', error);
    }
  };

  React.useEffect(() => {
    if (podName) {
      fetchRawData();
    }
  }, [podName]);

  return (
    <div style={{ marginTop: '2rem', padding: '1rem', backgroundColor: '#676565ff' }}>
      <h3>Debug Info</h3>
      <button onClick={fetchRawData}>Refresh Debug Data</button>
      <div style={{ marginTop: '1rem' }}>
        <strong>Raw Content from Pod:</strong>
        <pre style={{ 
          backgroundColor: '#333', 
          color: '#b5b2b2ff', 
          padding: '1rem', 
          overflow: 'auto',
          maxHeight: '300px'
        }}>
          {rawContent || 'No content fetched yet'}
        </pre>
      </div>
    </div>
  );
};

export default DebugReader;