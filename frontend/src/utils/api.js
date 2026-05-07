export const API_URL = import.meta.env.VITE_API_URL || '';

const TOKEN_KEY = 'dashboard_auth_token';

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Wrapper autour de fetch() qui ajoute automatiquement l'Authorization header
 * et déconnecte l'utilisateur sur 401. À utiliser pour toute requête vers le backend.
 */
export async function authFetch(input, init = {}) {
  const token = getAuthToken();
  const headers = new Headers(init.headers || {});
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const res = await fetch(input, { ...init, headers });
  if (res.status === 401) {
    setAuthToken(null);
    window.dispatchEvent(new CustomEvent('auth:unauthorized'));
  }
  return res;
}

/**
 * Fetch helper — builds a full URL from an endpoint + query params.
 * Uses VITE_API_URL in production (Vercel → Render), falls back to
 * same-origin in dev (Vite proxy or co-located backend).
 */
export async function fetchApi(endpoint, params = {}) {
  const url = new URL(endpoint, API_URL || window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null && v !== '') url.searchParams.set(k, v);
  });
  const res = await authFetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}
