import React from 'react';

interface LoginSectionProps {
  onLogin: () => void;
}

// Separated login functionality for ease of access

const LoginSection: React.FC<LoginSectionProps> = ({ onLogin }) => {
  return (
    <div>
      <h2>Login Required</h2>
      <p>Please log in to your Solid Pod to read data.</p>
      <button onClick={onLogin}>Login to Solid</button>
    </div>
  );
};

export default LoginSection;