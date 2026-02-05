import { useState, useEffect } from 'react';
import { AppSettings } from '../types';

export const useUpdates = (settings: AppSettings) => {
  const [updates, setUpdates] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);

  const addUpdate = (message: string) => {
    const timeFormat = settings.timeFormat === '24h' ? 'HH:mm:ss' : 'hh:mm:ss A';
    const timestamp = new Date().toLocaleTimeString('en-US', { 
      hour12: settings.timeFormat !== '24h',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    setUpdates(prev => [...prev, `[${timestamp}]: ${message}`]);
  };

  const clearUpdates = () => {
    setUpdates([]);
  };

  useEffect(() => {
    if (autoScroll && updates.length > 0) {
      const updatesContainer = document.getElementById('updates-log');
      if (updatesContainer) {
        updatesContainer.scrollTop = updatesContainer.scrollHeight;
      }
    }
  }, [updates, autoScroll]);

  return {
    updates,
    autoScroll,
    setAutoScroll,
    addUpdate,
    clearUpdates
  };
};