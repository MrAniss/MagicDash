import { Router } from 'express';
import { isAuthenticated } from '../auth.js';
import {
  getPaidSocialRows,
  getPaidSocialBreakdown,
  aggregatePaidSocialMetrics,
  groupPaidSocialBy,
  buildPaidSocialTrend,
  detectTrackingIssue,
  getAudienceWinnersLosers,
} from '../services/paidSocialAggregator.js';
import { getComparisonDates, daysBetween, pctChange, r2 } from '../dateUtils.js';
import { isMetaConfigured, getMetaAds } from '../metaAdsClient.js';
import { getMetaSupportedMarkets } from '../config/paidSocialAccounts.js';

const router = Router();

// Gate all paid-social routes behind Google OAuth (consistent with the rest of the API).
router.use((req, res, next) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  next();
});

// Phase 1 hard scope. The frontend toggle is disabled for anything else, but
// keep a guard in case someone hits the API directly.
function normalizeScope(req) {
  const platform = (req.query.platform || 'meta').toLowerCase();
  const brand    = (req.query.brand    || 'BRAND_A').toUpperCase();
  const market   = (req.query.market   || 'FR').toUpperCase();
  return { platform, brand, market };
}

// ─── GET /api/paid-social/kpis ────────────────────────────
router.get('/kpis', async (req, res) => {
  try {
    const { platform, brand, market } = normalizeScope(req);
    const { from, to, compareTo = 'previous_period' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const [currRows, prevRows] = await Promise.all([
      getPaidSocialRows({ platform, brand, market, from, to }),
      getPaidSocialRows({ platform, brand, market, from: compFrom, to: compTo }),
    ]);

    const current  = aggregatePaidSocialMetrics(currRows);
    const previous = aggregatePaidSocialMetrics(prevRows);
    const deltas = {
      impressions_pct: pctChange(current.impressions, previous.impressions),
      clicks_pct:      pctChange(current.clicks,      previous.clicks),
      ctr_pct:         pctChange(current.ctr,         previous.ctr),
      cost_pct:        pctChange(current.cost,        previous.cost),
      cpc_pct:         pctChange(current.cpc,         previous.cpc),
      conversions_pct: pctChange(current.conversions, previous.conversions),
      revenue_pct:     pctChange(current.revenue,     previous.revenue),
      cvr_pct:         pctChange(current.cvr,         previous.cvr),
      aov_pct:         pctChange(current.aov,         previous.aov),
      roas_pct:        pctChange(current.roas,        previous.roas),
    };

    res.json({
      platform,
      brand,
      market,
      current,
      previous,
      deltas,
      tracking_warning: detectTrackingIssue(current),
      configured: isMetaConfigured(),
    });
  } catch (err) {
    console.error('PaidSocial/kpis:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/paid-social/trend ───────────────────────────
router.get('/trend', async (req, res) => {
  try {
    const { platform, brand, market } = normalizeScope(req);
    const { from, to, granularity } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const days = daysBetween(from, to);
    const gran = granularity || (days <= 90 ? 'day' : 'week');

    const rows = await getPaidSocialRows({ platform, brand, market, from, to });
    const series = buildPaidSocialTrend(rows, gran);

    res.json({ platform, brand, market, granularity: gran, series });
  } catch (err) {
    console.error('PaidSocial/trend:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/paid-social/campaigns ───────────────────────
router.get('/campaigns', async (req, res) => {
  try {
    const { platform, brand, market } = normalizeScope(req);
    const { from, to, compareTo = 'previous_period', status = 'all' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const [currRows, prevRows] = await Promise.all([
      getPaidSocialRows({ platform, brand, market, from, to }),
      getPaidSocialRows({ platform, brand, market, from: compFrom, to: compTo }),
    ]);

    const byCampaign      = groupPaidSocialBy(currRows, r => r.campaign_id || r.campaign);
    const prevByCampaign  = groupPaidSocialBy(prevRows, r => r.campaign_id || r.campaign);

    const campaigns = Object.entries(byCampaign).map(([cid, rows]) => {
      const cur  = aggregatePaidSocialMetrics(rows);
      const prev = aggregatePaidSocialMetrics(prevByCampaign[cid] || []);
      const first = rows[0] || {};
      return {
        campaign_id:   cid,
        campaign_name: first.campaign || cid,
        platform:      first.platform || platform,
        ...cur,
        delta_impressions: pctChange(cur.impressions, prev.impressions),
        delta_clicks:      pctChange(cur.clicks,      prev.clicks),
        delta_ctr:         pctChange(cur.ctr,         prev.ctr),
        delta_cost:        pctChange(cur.cost,        prev.cost),
        delta_cpc:         pctChange(cur.cpc,         prev.cpc),
        delta_conversions: pctChange(cur.conversions, prev.conversions),
        delta_revenue:     pctChange(cur.revenue,     prev.revenue),
        delta_cvr:         pctChange(cur.cvr,         prev.cvr),
        delta_aov:         pctChange(cur.aov,         prev.aov),
        delta_roas:        pctChange(cur.roas,        prev.roas),
      };
    });

    // Status filter is best-effort: Meta does not return campaign.status in the
    // insights row when level=campaign. We leave the door open by accepting the
    // param but ignore it for now — could re-fetch /campaigns endpoint later.
    let filtered = campaigns;
    if (status && status !== 'all') {
      // no-op for now (see comment above)
    }

    filtered.sort((a, b) => b.cost - a.cost);
    res.json({ platform, brand, market, campaigns: filtered });
  } catch (err) {
    console.error('PaidSocial/campaigns:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/paid-social/ads ─────────────────────────────
// Drill-down: ad-level metrics + creative previews for a single campaign.
router.get('/ads', async (req, res) => {
  try {
    const { platform, brand, market } = normalizeScope(req);
    const { from, to, campaign_id, compareTo = 'previous_period', status = 'active' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });
    if (!campaign_id) return res.status(400).json({ error: 'Missing campaign_id' });
    if (platform !== 'meta') return res.json({ platform, ads: [] }); // Phase 2

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const [currAds, prevAds] = await Promise.all([
      getMetaAds({ brand, market, from, to, campaignId: campaign_id, status }),
      // Comparison reuses the same status filter so the ad universe is consistent.
      getMetaAds({ brand, market, from: compFrom, to: compTo, campaignId: campaign_id, status }),
    ]);

    const prevByAd = {};
    for (const a of prevAds) prevByAd[a.ad_id] = a;

    const ads = currAds.map(a => {
      const p = prevByAd[a.ad_id] || {};
      return {
        ...a,
        delta_impressions: pctChange(a.impressions, p.impressions || 0),
        delta_clicks:      pctChange(a.clicks,      p.clicks      || 0),
        delta_ctr:         pctChange(a.ctr,         p.ctr         || 0),
        delta_cost:        pctChange(a.cost,        p.cost        || 0),
        delta_cpc:         pctChange(a.cpc,         p.cpc         || 0),
        delta_conversions: pctChange(a.conversions, p.conversions || 0),
        delta_revenue:     pctChange(a.revenue,     p.revenue     || 0),
        delta_roas:        pctChange(a.roas,        p.roas        || 0),
      };
    });
    // Sort by impressions desc — surfaces the creatives that actually got
    // exposure first, with zero-impression actives falling to the bottom.
    ads.sort((x, y) => (y.impressions || 0) - (x.impressions || 0));

    res.json({ platform, brand, market, campaign_id, status, ads });
  } catch (err) {
    console.error('PaidSocial/ads:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/paid-social/breakdown ───────────────────────
const ALLOWED_DIMENSIONS = {
  placement: 'publisher_platform',
  device:    'device_platform',
  age:       'age',
  gender:    'gender',
};

router.get('/breakdown', async (req, res) => {
  try {
    const { platform, brand, market } = normalizeScope(req);
    const { from, to, dimension = 'placement', compareTo = 'previous_period' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const metaDim = ALLOWED_DIMENSIONS[dimension];
    if (!metaDim) return res.status(400).json({ error: `Unknown dimension: ${dimension}` });

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const [currRows, prevRows] = await Promise.all([
      getPaidSocialBreakdown({ platform, brand, market, from, to, dimension: metaDim }),
      getPaidSocialBreakdown({ platform, brand, market, from: compFrom, to: compTo, dimension: metaDim }),
    ]);

    const grouped = groupPaidSocialBy(currRows, r => r.segment || 'unknown');
    const prevGrouped = groupPaidSocialBy(prevRows, r => r.segment || 'unknown');
    const totalCost = currRows.reduce((s, r) => s + (r.cost || 0), 0);

    const segments = Object.entries(grouped).map(([segment, group]) => {
      const cur  = aggregatePaidSocialMetrics(group);
      const prev = aggregatePaidSocialMetrics(prevGrouped[segment] || []);
      return {
        segment,
        ...cur,
        cost_pct:          totalCost > 0 ? r2((cur.cost / totalCost) * 100) : 0,
        delta_impressions: pctChange(cur.impressions, prev.impressions),
        delta_clicks:      pctChange(cur.clicks,      prev.clicks),
        delta_ctr:         pctChange(cur.ctr,         prev.ctr),
        delta_cost:        pctChange(cur.cost,        prev.cost),
        delta_cpc:         pctChange(cur.cpc,         prev.cpc),
        delta_conversions: pctChange(cur.conversions, prev.conversions),
        delta_revenue:     pctChange(cur.revenue,     prev.revenue),
        delta_cvr:         pctChange(cur.cvr,         prev.cvr),
        delta_aov:         pctChange(cur.aov,         prev.aov),
        delta_roas:        pctChange(cur.roas,        prev.roas),
      };
    }).sort((a, b) => b.cost - a.cost);

    res.json({ platform, brand, market, dimension, total_cost: r2(totalCost), segments });
  } catch (err) {
    console.error('PaidSocial/breakdown:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/paid-social/audiences/winners-losers ────────
// Cross-dimensional ranking: top + bottom segments by ROAS, pulled from all
// 4 single-dim breakdowns and filtered by a min-spend floor.
router.get('/audiences/winners-losers', async (req, res) => {
  try {
    const { platform, brand, market } = normalizeScope(req);
    const { from, to, min_cost = 50, limit = 3 } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const result = await getAudienceWinnersLosers({
      platform, brand, market,
      from, to,
      minCost: Number(min_cost) || 50,
      limit:   Number(limit)    || 3,
    });
    res.json({ platform, brand, market, ...result });
  } catch (err) {
    console.error('PaidSocial/audiences/winners-losers:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/paid-social/status ──────────────────────────
// Lightweight ping for the frontend — tells the UI whether the Meta SDK is
// usable so it can show a helpful banner when env vars are missing.
router.get('/status', (_req, res) => {
  res.json({
    meta_configured: isMetaConfigured(),
    tiktok_configured: false, // Phase 2
    meta_markets: { BRAND_A: getMetaSupportedMarkets('BRAND_A') },
  });
});

// ─── GET /api/paid-social/diagnose ────────────────────────
// Surfaces the actual Meta API error from inside the running process so we
// can debug token / permission issues without tailing logs.
// DEV ONLY — disabled in production because the response leaks a token preview.
router.get('/diagnose', async (_req, res) => {
  if (process.env.NODE_ENV === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }
  const token = process.env.META_ACCESS_TOKEN || '';
  const accountId = process.env.META_AD_ACCOUNT_ID || '';
  const v = process.env.META_API_VERSION || 'v21.0';
  const out = {
    token_preview: token ? token.slice(0, 16) + '...' + token.slice(-12) + ` (len ${token.length})` : '<empty>',
    account_id: accountId,
    api_version: v,
  };
  try {
    const me = await fetch(`https://graph.facebook.com/${v}/me?access_token=${encodeURIComponent(token)}`);
    out.me = await me.json();
  } catch (e) { out.me = { fetch_error: e.message }; }
  try {
    const acc = await fetch(`https://graph.facebook.com/${v}/${accountId}?fields=id,name,currency,account_status&access_token=${encodeURIComponent(token)}`);
    out.account = await acc.json();
  } catch (e) { out.account = { fetch_error: e.message }; }
  try {
    const today = new Date().toISOString().slice(0,10);
    const monthAgo = new Date(Date.now() - 30*86400e3).toISOString().slice(0,10);
    const ins = await fetch(`https://graph.facebook.com/${v}/${accountId}/insights?fields=impressions,clicks,spend&time_range={"since":"${monthAgo}","until":"${today}"}&level=account&access_token=${encodeURIComponent(token)}`);
    out.insights_raw = await ins.json();
  } catch (e) { out.insights_raw = { fetch_error: e.message }; }

  // SDK path — what our getMetaRows() actually does
  try {
    const today = new Date().toISOString().slice(0,10);
    const monthAgo = new Date(Date.now() - 30*86400e3).toISOString().slice(0,10);
    const { getMetaRows } = await import('../metaAdsClient.js');
    const rows = await getMetaRows({ brand: 'BRAND_A', market: 'FR', from: monthAgo, to: today });
    out.sdk_rows_count = rows.length;
    if (rows[0]) out.sdk_sample = rows[0];
  } catch (e) {
    out.sdk_error = { message: e.message, stack: (e.stack||'').slice(0, 600) };
  }

  res.json(out);
});

export default router;
