import { createContext, useContext, useState, useCallback } from 'react';
import { login as apiLogin } from '../api/index.js';

const AuthContext = createContext(null);

const STORAGE_KEY = 'zvbl_roster_auth';

function loadSaved() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch {
    // ignore
  }
  return null;
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(loadSaved);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiLogin(username, password);
      const saved = { token: data.token, user: data.user };
      setAuth(saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    setAuth(null);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = {
    token: auth?.token,
    user: auth?.user,
    isAuthenticated: !!auth?.token,
    loading,
    error,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
