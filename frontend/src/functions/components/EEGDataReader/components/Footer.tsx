import React from 'react';

interface FooterProps {
  mode: 'live' | 'review';
}

const Footer: React.FC<FooterProps> = ({ mode }) => {
  return (
    <footer className="app-footer">
      <p>DreamRT v1.0 • {mode === 'live' ? 'Live EEG Monitoring' : 'Sleep Session Review'} • {new Date().getFullYear()}</p>
      <p className="demo-notice">
        {mode === 'live' ? 'Live mode: Real-time EEG data streaming' : 'Review mode: Historical sleep session analysis'}
      </p>
    </footer>
  );
};

export default Footer;