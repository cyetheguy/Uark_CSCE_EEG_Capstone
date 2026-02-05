// import React from 'react';
// import './App.css';
// import SolidPodListener from './functions/SolidPodListener';

// const App: React.FC = () => {
//   return (
//     <div className="App">
//       <SolidPodListener />
//     </div>
//   );
// };

// export default App;


import React from 'react';
import './App.css';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import EEGDataReader from './functions/components/EEGDataReader/EEGDataReader';

const App: React.FC = () => {
  return (
    <Router>
      <div className="App">
        <Routes>
          {/* Redirect root to login/data reader */}
          <Route path="/" element={<Navigate to="/reader" replace />} />
          
          {/* Main EEG Data Reader (with login) */}
          <Route path="/reader" element={<EEGDataReader />} />
          
          {/* Optional: Add a 404 page */}
          <Route path="*" element={
            <div style={{ 
              textAlign: 'center', 
              padding: '3rem',
              minHeight: '100vh',
              backgroundColor: '#f7fafc'
            }}>
              <h1 style={{ color: '#2d3748' }}>404 - Page Not Found</h1>
              <p style={{ color: '#718096', marginTop: '1rem' }}>
                The page you're looking for doesn't exist.
              </p>
              <a 
                href="/reader" 
                style={{
                  display: 'inline-block',
                  marginTop: '1rem',
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#667eea',
                  color: 'white',
                  textDecoration: 'none',
                  borderRadius: '6px',
                  fontWeight: '500'
                }}
              >
                Go to EEG Data Reader
              </a>
            </div>
          } />
        </Routes>
      </div>
    </Router>
  );
};

export default App;