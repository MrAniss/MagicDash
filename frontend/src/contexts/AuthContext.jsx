import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { API_URL, getAuthToken, setAuthToken } from '../utils/api';

const AuthContext = createContext(null);
const USER_KEY = 'dashboard_auth_user';

function loadStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function storeUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch {
    /* ignore */
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => (getAuthToken() ? loadStoredUser() : null));

  const logout = useCallback(() => {
    setAuthToken(null);
    storeUser(null);
    setUser(null);
  }, []);

  // Si une requête /api retourne 401, le token est invalide → on déconnecte.
  useEffect(() => {
    function handler() {
      storeUser(null);
      setUser(null);
    }
    window.addEventListener('auth:unauthorized', handler);
    return () => window.removeEventListener('auth:unauthorized', handler);
  }, []);

  const login = useCallback(async (email, password) => {
    const res = await fetch(`${API_URL}/auth/user-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(body.error || 'Erreur de connexion');
    }
    setAuthToken(body.token);
    storeUser(body.user);
    setUser(body.user);
    return body.user;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
