import { useState } from 'react';

export const useAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setLoginError('');
    
    await new Promise(resolve => setTimeout(resolve, 800));
    try {
      const response = await fetch('http://localhost:5000/api/login', {
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