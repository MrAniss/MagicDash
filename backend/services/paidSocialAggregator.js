// Aggregates Paid Social metrics across platforms.
// Phase 1: only Meta is wired. TikTok and combined ('all') return Meta-only
// data with a `platforms` array describing which sources contributed —
// keeps the downstream contract stable when TikTok lands in Phase 2.

import { getMetaRows, getMetaBreakdown } from '../metaAdsClient.js';
import { r2 } from '../dateUtils.js';

// Used by getAudienceWinnersLosers as a human-readable badge for each segment.
const META_DIM_LABELS = {
  publisher_platform: 'PLATEFORME',
  device_platform:    'DEVICE',
  age:                'ÂGE',
  gender:             'GENRE',
};

// ─── Aggregation helpers ──────────────────────────────────

export function aggregatePaidSocialMetrics(rows) {
  let impressions = 0, clicks = 0, cost = 0, conversions = 0, revenue = 0;
  for (const r of rows) {
    impressions += r.impressions || 0;
    clicks      += r.clicks      || 0;
    cost        += r.cost        || 0;
    conversions += r.conversions || 0;
    revenue     += r.revenue     || 0;
  }
  return {
    impressions,
    clicks,
    cost:        r2(cost),
    revenue:     r2(revenue),
    conversions: r2(conversions),
    ctr:  impressions > 0 ? r2((clicks      / impressions) * 100) : 0,
    cpc:  clicks      > 0 ? r2( cost        / clicks)             : 0,
    cvr:  clicks      > 0 ? r2((conversions / clicks)      * 100) : 0,
    aov:  conversions > 0 ? r2( revenue     / conversions)        : 0,
    roas: cost        > 0 ? r2( revenue     / cost)               : 0,
  };
}

export function groupPaidSocialBy(rows, keyFn) {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r);
    if (!out[k]) out[k] = [];
    out[k].push(r);
  }
  return out;
}

// ─── Multi-platform fetchers ──────────────────────────────

async function fetchByPlatform({ platform, brand, market, from, to }) {
  if (platform === 'meta')   return getMetaRows({ brand, market, from, to });
  if (platform === 'tiktok') return [];                                   // Phase 2
  if (platform === 'all') {
    const [meta, tiktok] = await Promise.all([
      getMetaRows({ brand, market, from, to }),
      Promise.resolve([]),                                                // Phase 2
    ]);
    return [...meta, ...tiktok];
  }
  return [];
}

async function fetchBreakdownByPlatform({ platform, brand, market, from, to, dimension }) {
  if (platform === 'meta')   return getMetaBreakdown({ brand, market, from, to, dimension });
  if (platform === 'tiktok') return [];
  if (platform === 'all')    return getMetaBreakdown({ brand, market, from, to, dimension });
  return [];
}

// ─── Public API ───────────────────────────────────────────

export async function getPaidSocialRows({ platform, brand, market, from, to }) {
  return fetchByPlatform({ platform, brand, market, from, to });
}

export async function getPaidSocialBreakdown({ platform, brand, market, from, to, dimension }) {
  return fetchBreakdownByPlatform({ platform, brand, market, from, to, dimension });
}

/**
 * Build a daily trend series from raw rows.
 */
export function buildPaidSocialTrend(rows, granularity = 'day') {
  let keyFn;
  if (granularity === 'week') {
    keyFn = r => {
      const d = new Date(r.date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      return monday.toISOString().slice(0, 10);
    };
  } else if (granularity === 'month') {
    keyFn = r => (r.date || '').slice(0, 7);
  } else {
    keyFn = r => r.date || '';
  }

  const grouped = groupPaidSocialBy(rows, keyFn);
  return Object.entries(grouped)
    .map(([date, group]) => ({ date, ...aggregatePaidSocialMetrics(group) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Tracking-quality heuristic: if we spent meaningfully but revenue is zero
 * AND we have material click volume, the pixel is probably not firing.
 */
export function detectTrackingIssue(metrics) {
  return Boolean(metrics?.cost > 100 && metrics?.revenue === 0 && metrics?.clicks > 1000);
}

// ─── Audience analysis ────────────────────────────────────

/**
 * Scan all four single-dim breakdowns (placement / device / age / gender)
 * and surface the best and worst-performing segments by ROAS.
 *
 * Each segment is filtered by `minCost` to suppress statistically meaningless
 * cells. The cost-share is computed within its own dimension (the same euro
 * appears in every dimension, just partitioned differently).
 */
export async function getAudienceWinnersLosers({ platform, brand, market, from, to, minCost = 50, limit = 3 }) {
  if (platform !== 'meta') return { top: [], flop: [], min_cost_threshold: minCost };

  const dims = Object.keys(META_DIM_LABELS);
  const allByDim = await Promise.all(
    dims.map(d => getMetaBreakdown({ brand, market, from, to, dimension: d })),
  );

  const allSegments = [];
  for (let i = 0; i < dims.length; i++) {
    const dim = dims[i];
    const rows = allByDim[i];
    const grouped = groupPaidSocialBy(rows, r => r.segment || 'unknown');
    const dimTotalCost = rows.reduce((s, r) => s + (r.cost || 0), 0);

    for (const [segment, group] of Object.entries(grouped)) {
      const m = aggregatePaidSocialMetrics(group);
      if (m.cost < minCost) continue;
      allSegments.push({
        dimension:       dim,
        dimension_label: META_DIM_LABELS[dim],
        segment,
        ...m,
        dim_cost_share:  dimTotalCost > 0 ? r2((m.cost / dimTotalCost) * 100) : 0,
      });
    }
  }

  const sorted = [...allSegments].sort((a, b) => b.roas - a.roas);
  return {
    min_cost_threshold: minCost,
    total_segments_evaluated: allSegments.length,
    top:  sorted.slice(0, limit),
    flop: sorted.slice(-limit).reverse(),
  };
}

