import { useState } from 'react';

const AUTH_STORAGE_KEY = 'eeg_capstone_auth';

function getStoredAuth(): { isAuthenticated: boolean; username: string } {
  // We persist only the fact that the UI is "logged in" + the username, so that refreshing
  // the page doesn't immediately bounce the user back to the login screen.
  //
  // Important: this is *UI state*, not a secure backend session token.
  // The backend's ability to decrypt/encrypt `.eeg` sessions depends on `crypto_ops.USR_KEY`,
  // which is established only when `/api/login` succeeds (and is lost on backend restart).
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

    // The backend's PBKDF2 (200k iterations, per .USR file) already takes
    // a noticeable amount of time on a typical desktop; adding an artificial
    // delay on top of that made the form feel frozen for several seconds
    // after account creation. Let the real request drive the spinner.
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
    // UI logout only clears local state/storage. Backend keying is reset on backend restart
    // or by simply logging in as a different user.
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