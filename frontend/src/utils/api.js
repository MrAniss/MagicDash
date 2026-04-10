export const API_URL = import.meta.env.VITE_API_URL || '';

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
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}
