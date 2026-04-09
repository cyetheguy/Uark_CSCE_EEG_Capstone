import { useState } from 'react';

const AUTH_STORAGE_KEY = 'eeg_capstone_auth';

function getStoredAuth(): { isAuthenticated: boolean; username: string } {
  try {
    const stored = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!stored) return { isAuthenticated: false, username: '' };
    const parsed = JSON.parse(stored) as { isAuthenticated?: boolean; username?: string };
    return {
      isAuthenticated: !!parsed?.isAuthenticated,
      username: typeof parsed?.username === 'string' ? parsed.username : '',
    };
  } catch {
    return { isAuthenticated: false, username: '' };
  }
}

function setStoredAuth(isAuthenticated: boolean, username: string) {
  if (isAuthenticated) {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ isAuthenticated: true, username }));
  } else {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
}

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(() => getStoredAuth().isAuthenticated);
  const [username, setUsername] = useState(() => getStoredAuth().username);
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    
    await new Promise(resolve => setTimeout(resolve, 800));
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (data.success === 1) {
        console.log("Backend returned 1: Success");
        setIsAuthenticated(true);
        setStoredAuth(true, username);
      } else {
        console.log("Backend returned 0: Failure");
        setLoginError('Invalid username or password. Try demo/sleep123 or admin/admin123');
      }

    } catch (error) {
      console.error("Error:", error);
      setLoginError('Server connection failed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    setUsername('');
    setPassword('');
    setLoginError('');
    setStoredAuth(false, '');
  };

  return {
    isAuthenticated,
    username,
    password,
    loginError,
    isLoading,
    setUsername,
    setPassword,
    handleLogin,
    handleLogout
  };
};