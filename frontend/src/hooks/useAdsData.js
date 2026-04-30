import { useQuery } from '@tanstack/react-query';
import { useComarket } from '../contexts/ComarketContext';
import { fetchApi } from '../utils/api';

export function useKpis({ brand, market, from, to, compareTo }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['kpis', brand, market, from, to, compareTo, includeComarket],
    queryFn: () => fetchApi('/api/kpis', { brand, market, from, to, compareTo, includeComarket }),
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
    queryFn: () =>
      fetchApi('/api/campaigns', { brand, market, from, to, type, compareTo, includeComarket }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useGranularity({ brand, market, from, to, compareTo, granularity }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['granularity', brand, market, from, to, compareTo, granularity, includeComarket],
    queryFn: () =>
      fetchApi('/api/granularity', {
        brand,
        market,
        from,
        to,
        compareTo,
        granularity,
        includeComarket,
      }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useComarketData({ from, to, compareTo, partnerBrand }) {
  return useQuery({
    queryKey: ['comarket', from, to, compareTo, partnerBrand],
    queryFn: () => fetchApi('/api/comarket', { from, to, compareTo, partnerBrand }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useTrendYtd({
  brand,
  market,
  granularity,
  includeComarket: includeComarketOverride,
  onlyComarket,
  partnerBrand,
}) {
  const { includeComarket: globalIncludeComarket } = useComarket();
  const includeComarket =
    includeComarketOverride !== undefined ? includeComarketOverride : globalIncludeComarket;

  return useQuery({
    queryKey: ['trendYtd', brand, market, granularity, includeComarket, onlyComarket, partnerBrand],
    queryFn: () =>
      fetchApi('/api/trend/ytd', {
        brand,
        market,
        granularity,
        includeComarket,
        onlyComarket,
        partnerBrand,
      }),
    staleTime: 60 * 60 * 1000,
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

export function useWeeklySummary({ brand, market }) {
  return useQuery({
    queryKey: ['weeklySummary', brand, market],
    queryFn: () => fetchApi('/api/reports/weekly-summary', { brand, market }),
    staleTime: 5 * 60 * 1000,
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
    queryFn: () =>
      fetchApi('/api/ga4/trend', { brand, market, from, to, granularity, sourceMedium }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useGA4Channels({ brand, market, from, to, compareTo, sourceMedium }) {
  return useQuery({
    queryKey: ['ga4Channels', brand, market, from, to, compareTo, sourceMedium],
    queryFn: () =>
      fetchApi('/api/ga4/channels', { brand, market, from, to, compareTo, sourceMedium }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useGA4BounceRateYtd({ brand, market, sourceMedium, granularity = 'week' }) {
  return useQuery({
    queryKey: ['ga4BounceRateYtd', brand, market, sourceMedium, granularity],
    queryFn: () =>
      fetchApi('/api/ga4/bounce-rate-ytd', { brand, market, sourceMedium, granularity }),
    placeholderData: (prev) => prev,
  });
}

export function useGA4TrendYtd({ brand, market, granularity, sourceMedium }) {
  return useQuery({
    queryKey: ['ga4TrendYtd', brand, market, granularity, sourceMedium],
    queryFn: () => fetchApi('/api/ga4/trend/ytd', { brand, market, granularity, sourceMedium }),
    staleTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });
}

export function useGA4FunnelYtd({ brand, market, granularity = 'week' }) {
  return useQuery({
    queryKey: ['ga4FunnelYtd', brand, market, granularity],
    queryFn: () => fetchApi('/api/ga4/funnel-ytd', { brand, market, granularity }),
    placeholderData: (prev) => prev,
  });
}
