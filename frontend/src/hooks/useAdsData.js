import { useQuery } from '@tanstack/react-query';
import { useComarket } from '../contexts/ComarketContext';

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

export function useKpis({ brand, market, from, to, compareTo }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['kpis', brand, market, from, to, compareTo, includeComarket],
    queryFn: () => fetchApi('/api/kpis', { brand, market, from, to, compareTo, includeComarket }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useTrend({ brand, market, from, to, compareTo, granularity }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['trend', brand, market, from, to, compareTo, granularity, includeComarket],
    queryFn: () => fetchApi('/api/trend', { brand, market, from, to, compareTo, granularity, includeComarket }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useMarkets({ brand, from, to, compareTo }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['markets', brand, from, to, compareTo, includeComarket],
    queryFn: () => fetchApi('/api/markets', { brand, from, to, compareTo, includeComarket }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useCampaigns({ brand, market, from, to, type, compareTo }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['campaigns', brand, market, from, to, type, compareTo, includeComarket],
    queryFn: () => fetchApi('/api/campaigns', { brand, market, from, to, type, compareTo, includeComarket }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useGranularity({ brand, market, from, to, compareTo, granularity }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['granularity', brand, market, from, to, compareTo, granularity, includeComarket],
    queryFn: () => fetchApi('/api/granularity', { brand, market, from, to, compareTo, granularity, includeComarket }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useComarketData({ from, to, compareTo }) {
  return useQuery({
    queryKey: ['comarket', from, to, compareTo],
    queryFn: () => fetchApi('/api/comarket', { from, to, compareTo }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useAuthStatus() {
  return useQuery({
    queryKey: ['authStatus'],
    queryFn: () => fetchApi('/auth/status', {}),
    staleTime: 30_000,
  });
}

export function useDemoMode() {
  return useQuery({
    queryKey: ['demoMode'],
    queryFn: () => fetchApi('/api/mode', {}),
    staleTime: 60_000,
  });
}

// ─── GA4 hooks ─────────────────────────────────────────

export function useGA4Kpis({ brand, market, from, to, compareTo, sourceMedium }) {
  return useQuery({
    queryKey: ['ga4Kpis', brand, market, from, to, compareTo, sourceMedium],
    queryFn: () => fetchApi('/api/ga4/kpis', { brand, market, from, to, compareTo, sourceMedium }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useGA4Trend({ brand, market, from, to, granularity, sourceMedium }) {
  return useQuery({
    queryKey: ['ga4Trend', brand, market, from, to, granularity, sourceMedium],
    queryFn: () => fetchApi('/api/ga4/trend', { brand, market, from, to, granularity, sourceMedium }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useGA4Channels({ brand, market, from, to, compareTo, sourceMedium }) {
  return useQuery({
    queryKey: ['ga4Channels', brand, market, from, to, compareTo, sourceMedium],
    queryFn: () => fetchApi('/api/ga4/channels', { brand, market, from, to, compareTo, sourceMedium }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

