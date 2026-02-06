import React, { useState } from 'react';

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
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [createError, setCreateError] = useState('');

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    if (newPassword !== confirmPassword) {
      setCreateError('Passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      setCreateError('Password must be at least 6 characters');
      return;
    }

    try {
      const response = await fetch('http://localhost:5000/api/create-account', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
        }),
      });

      const data = await response.json();

      if (data.success) {
        alert(`Account "${newUsername}" created successfully! You can now log in.`);
        setShowCreateAccount(false);
        setNewUsername('');
        setNewPassword('');
        setConfirmPassword('');
      } else {
        setCreateError(data.error || 'Failed to create account');
      }
    } catch (error) {
      console.error('Error creating account:', error);
      setCreateError('Failed to connect to server. Make sure the backend is running.');
    }
  };

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

        {/* Create Account Link */}
        <div className="create-account-link">
          <p>
            Don't have an account?{' '}
            <button
              type="button"
              className="create-account-button"
              onClick={() => setShowCreateAccount(true)}
            >
              Create one
            </button>
          </p>
        </div>
        
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

      {/* Create Account Modal */}
      {showCreateAccount && (
        <div className="create-account-overlay" onClick={() => setShowCreateAccount(false)}>
          <div className="create-account-modal" onClick={(e) => e.stopPropagation()}>
            <div className="create-account-header">
              <h2>Create Account</h2>
              <button
                className="close-modal-button"
                onClick={() => {
                  setShowCreateAccount(false);
                  setCreateError('');
                  setNewUsername('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateAccount} className="create-account-form">
              <div className="form-group">
                <label htmlFor="new-username">Username</label>
                <input
                  id="new-username"
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="Choose a username"
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="new-password">Password</label>
                <input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Create a password (min 6 characters)"
                  required
                  minLength={6}
                />
              </div>

              <div className="form-group">
                <label htmlFor="confirm-password">Confirm Password</label>
                <input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter your password"
                  required
                />
              </div>

              {createError && (
                <div className="error-message">
                  {createError}
                </div>
              )}

              <button type="submit" className="create-account-submit-button">
                Create Account
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default LoginScreen;