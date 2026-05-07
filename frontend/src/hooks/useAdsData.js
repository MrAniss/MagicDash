import { useQuery } from '@tanstack/react-query';
import { useComarket } from '../contexts/ComarketContext';
import { fetchApi } from '../utils/api';

export function useKpis({ brand, market, from, to, compareTo, dataSource = 'ads' }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['kpis', brand, market, from, to, compareTo, includeComarket, dataSource],
    queryFn: () =>
      fetchApi('/api/kpis', { brand, market, from, to, compareTo, includeComarket, dataSource }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useMarkets({ brand, from, to, compareTo, dataSource = 'ads' }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['markets', brand, from, to, compareTo, includeComarket, dataSource],
    queryFn: () =>
      fetchApi('/api/markets', { brand, from, to, compareTo, includeComarket, dataSource }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useCampaigns({ brand, market, from, to, type, compareTo, dataSource = 'ads' }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['campaigns', brand, market, from, to, type, compareTo, includeComarket, dataSource],
    queryFn: () =>
      fetchApi('/api/campaigns', { brand, market, from, to, type, compareTo, includeComarket, dataSource }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function useGranularity({ brand, market, from, to, compareTo, granularity, dataSource = 'ads' }) {
  const { includeComarket } = useComarket();
  return useQuery({
    queryKey: ['granularity', brand, market, from, to, compareTo, granularity, includeComarket, dataSource],
    queryFn: () =>
      fetchApi('/api/granularity', {
        brand,
        market,
        from,
        to,
        compareTo,
        granularity,
        includeComarket,
        dataSource,
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
  dataSource = 'ads',
}) {
  const { includeComarket: globalIncludeComarket } = useComarket();
  const includeComarket =
    includeComarketOverride !== undefined ? includeComarketOverride : globalIncludeComarket;

  return useQuery({
    queryKey: ['trendYtd', brand, market, granularity, includeComarket, onlyComarket, partnerBrand, dataSource],
    queryFn: () =>
      fetchApi('/api/trend/ytd', {
        brand,
        market,
        granularity,
        includeComarket,
        onlyComarket,
        partnerBrand,
        dataSource,
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

export function useWeeklySummary({ brand, market, dataSource = 'ads' }) {
  return useQuery({
    queryKey: ['weeklySummary', brand, market, dataSource],
    queryFn: () => fetchApi('/api/reports/weekly-summary', { brand, market, dataSource }),
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

// ─── Paid Social (Meta) hooks ──────────────────────────

export function usePaidSocialKpis({ platform = 'meta', brand, market, from, to, compareTo }) {
  return useQuery({
    queryKey: ['paidSocialKpis', platform, brand, market, from, to, compareTo],
    queryFn: () =>
      fetchApi('/api/paid-social/kpis', { platform, brand, market, from, to, compareTo }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function usePaidSocialTrend({ platform = 'meta', brand, market, from, to, granularity = 'day' }) {
  return useQuery({
    queryKey: ['paidSocialTrend', platform, brand, market, from, to, granularity],
    queryFn: () =>
      fetchApi('/api/paid-social/trend', { platform, brand, market, from, to, granularity }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function usePaidSocialCampaigns({ platform = 'meta', brand, market, from, to, compareTo }) {
  return useQuery({
    queryKey: ['paidSocialCampaigns', platform, brand, market, from, to, compareTo],
    queryFn: () =>
      fetchApi('/api/paid-social/campaigns', { platform, brand, market, from, to, compareTo }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function usePaidSocialAds({ platform = 'meta', brand, market, from, to, campaignId }) {
  return useQuery({
    queryKey: ['paidSocialAds', platform, brand, market, from, to, campaignId],
    queryFn: () =>
      fetchApi('/api/paid-social/ads', { platform, brand, market, from, to, campaignId }),
    enabled: !!from && !!to && !!campaignId,
    placeholderData: (prev) => prev,
  });
}

export function usePaidSocialBreakdown({ platform = 'meta', brand, market, from, to, breakdown }) {
  return useQuery({
    queryKey: ['paidSocialBreakdown', platform, brand, market, from, to, breakdown],
    queryFn: () =>
      fetchApi('/api/paid-social/breakdown', { platform, brand, market, from, to, breakdown }),
    enabled: !!from && !!to && !!breakdown,
    placeholderData: (prev) => prev,
  });
}

export function usePaidSocialAudienceWinnersLosers({ platform = 'meta', brand, market, from, to }) {
  return useQuery({
    queryKey: ['paidSocialAudiences', platform, brand, market, from, to],
    queryFn: () =>
      fetchApi('/api/paid-social/audiences/winners-losers', { platform, brand, market, from, to }),
    enabled: !!from && !!to,
    placeholderData: (prev) => prev,
  });
}

export function usePaidSocialStatus() {
  return useQuery({
    queryKey: ['paidSocialStatus'],
    queryFn: () => fetchApi('/api/paid-social/status', {}),
    staleTime: 60_000,
  });
}

// ─── Feed Monitor hooks ────────────────────────────────

export function useFeedMonitorAttributes() {
  return useQuery({
    queryKey: ['feedMonitorAttributes'],
    queryFn: () => fetchApi('/api/feed-monitor/attributes'),
    staleTime: Infinity,
  });
}

export function useFeedMonitorStatus() {
  return useQuery({
    queryKey: ['feedMonitorStatus'],
    queryFn: () => fetchApi('/api/feed-monitor/status'),
    refetchInterval: 5_000,
  });
}

export function useFeedMonitorSummary({ brand, market }) {
  return useQuery({
    queryKey: ['feedMonitorSummary', brand, market],
    queryFn: () => fetchApi('/api/feed-monitor/summary', { brand, market }),
    placeholderData: (prev) => prev,
  });
}

export function useFeedMonitorDiffs(params) {
  return useQuery({
    queryKey: ['feedMonitorDiffs', params],
    queryFn: () => fetchApi('/api/feed-monitor/diffs', params),
    placeholderData: (prev) => prev,
  });
}

export function useFeedMonitorAttributeChanges({ brand, market, attribute, days = 90 }) {
  return useQuery({
    queryKey: ['feedMonitorAttributeChanges', brand, market, attribute, days],
    queryFn: () =>
      fetchApi('/api/feed-monitor/attribute-changes', { brand, market, attribute, days }),
    enabled: !!brand && !!market && !!attribute,
    placeholderData: (prev) => prev,
  });
}

export function useFeedMonitorRuns({ brand, market, limit = 20 }) {
  return useQuery({
    queryKey: ['feedMonitorRuns', brand, market, limit],
    queryFn: () => fetchApi('/api/feed-monitor/runs', { brand, market, limit }),
    placeholderData: (prev) => prev,
  });
}
