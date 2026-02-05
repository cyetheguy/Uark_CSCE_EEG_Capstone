import React from 'react';

interface LoginScreenProps {
  username: string;
  password: string;
  loginError: string;
  isLoading: boolean;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onLogin: (e: React.FormEvent) => void;
}

const LoginScreen: React.FC<LoginScreenProps> = ({
  username,
  password,
  loginError,
  isLoading,
  onUsernameChange,
  onPasswordChange,
  onLogin
}) => {
  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <h1>EEG Sleep Analyzer</h1>
          <p>Whole Night Sleep Session Visualization</p>
        </div>
        
        <form onSubmit={onLogin} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
              placeholder="Enter username"
              required
              disabled={isLoading}
            />
          </div>
          
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
              placeholder="Enter password"
              required
              disabled={isLoading}
            />
          </div>
          
          {loginError && (
            <div className="error-message">
              {loginError}
            </div>
          )}
          
          <button 
            type="submit" 
            className="login-button"
            disabled={isLoading}
          >
            {isLoading ? 'Authenticating...' : 'Login to Sleep Analyzer'}
          </button>
        </form>
        
        <div className="demo-credentials">
          <p><strong>Demo Credentials:</strong></p>
          <div className="credential-pair">
            <span>Username: <code>demo</code></span>
            <span>Password: <code>sleep123</code></span>
          </div>
          <div className="credential-pair">
            <span>Username: <code>admin</code></span>
            <span>Password: <code>admin123</code></span>
          </div>
        </div>
        
        <div className="login-footer">
          <p>Analyze whole night sleep EEG data with automatic sleep stage detection.</p>
        </div>
      </div>
    </div>
  );
};

export default LoginScreen;