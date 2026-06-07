import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token') || null);
  const [user, setUser] = useState(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync token to localStorage
  useEffect(() => {
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }, [token]);

  // Fetch current user details whenever token changes
  useEffect(() => {
    const fetchUser = async () => {
      if (!token) {
        setUser(null);
        setIsLoaded(true);
        return;
      }
      try {
        const response = await fetch('/api/me', {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        if (response.ok) {
          const data = await response.json();
          setUser(data);
        } else {
          // Token expired or invalid
          setToken(null);
          setUser(null);
        }
      } catch (err) {
        console.error('Error fetching user on mount:', err);
        // Do not discard token immediately on network issues, but set isLoaded
      } finally {
        setIsLoaded(true);
      }
    };
    fetchUser();
  }, [token]);

  const login = async (email, password) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  const register = async (email, password, firstName, lastName) => {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, firstName, lastName })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || 'Registration failed');
    }
    setToken(data.token);
    setUser(data.user);
    return data;
  };

  const getToken = async () => {
    return token;
  };

  const userId = user?.id || null;

  return (
    <AuthContext.Provider value={{ token, user, userId, isLoaded, login, logout, register, getToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const SignedIn = ({ children }) => {
  const { userId } = useAuth();
  return userId ? <>{children}</> : null;
};

export const SignedOut = ({ children }) => {
  const { userId } = useAuth();
  return !userId ? <>{children}</> : null;
};
