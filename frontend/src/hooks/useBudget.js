import { useQuery } from '@tanstack/react-query';

async function fetchApi(endpoint, params) {
  const url = new URL(endpoint, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v != null) url.searchParams.set(k, v);
  });
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `API error ${res.status}`);
  }
  return res.json();
}

export function useBudget({ brand, month }) {
  return useQuery({
    queryKey: ['budget', brand, month],
    queryFn: () => fetchApi('/api/budget', { brand, month }),
    enabled: !!month,
    placeholderData: (prev) => prev,
  });
}
