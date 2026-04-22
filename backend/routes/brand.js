import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRows } from '../googleAdsClient.js';
import { getGscBrandByDate } from '../searchConsoleClient.js';
import { GSC_PROPERTIES, resolveBrandLabel, resolveAdsBrandKey } from '../config/gscProperties.js';
import { isBrandCampaign } from '../config/brandKeywords.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OVERRIDES_PATH = path.join(__dirname, '..', 'config', 'brandCampaignOverrides.json');

const router = Router();

function r2(v) { return Math.round(v * 100) / 100; }
function pct(num, den) { return den > 0 ? r2((num / den) * 100) : 0; }
function pctChange(cur, prev) {
  if (prev === 0) return cur > 0 ? 100 : 0;
  return r2(((cur - prev) / prev) * 100);
}
function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function getComparisonDates(from, to) {
  const f = new Date(from), t = new Date(to);
  const diffDays = Math.round((t - f) / 86400000);
  const compTo = new Date(f); compTo.setDate(compTo.getDate() - 1);
  const compFrom = new Date(compTo); compFrom.setDate(compFrom.getDate() - diffDays);
  return { compFrom: fmtDate(compFrom), compTo: fmtDate(compTo) };
}

// ─── Overrides persistence ─────────────────────────────
function loadOverrides() {
  try {
    if (fs.existsSync(OVERRIDES_PATH)) {
      return JSON.parse(fs.readFileSync(OVERRIDES_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return {};
}
function saveOverrides(data) {
  fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(data, null, 2));
}
function getExcludedCampaignIds(brandLabel) {
  const all = loadOverrides();
  return new Set((all[brandLabel]?.excluded_campaign_ids) || []);
}

// ─── Google Ads brand-campaign filter ──────────────────
async function fetchAdsBrandCampaigns(adsBrandKey, from, to) {
  const rows = await getRows({ brand: adsBrandKey, market: 'FR', from, to, includeComarket: true });
  return rows.filter(r => isBrandCampaign(r.campaign));
}

function aggregateAdsBrandRows(rows, excludedIds) {
  let impressions = 0, clicks = 0, cost = 0, conversions = 0, revenue = 0;
  for (const r of rows) {
    if (excludedIds.has(String(r.campaignId))) continue;
    impressions += r.impressions;
    clicks += r.clicks;
    cost += r.cost;
    conversions += r.conversions;
    revenue += r.conversion_value;
  }
  return { impressions, clicks, cost, conversions, revenue };
}

// ─── Cannibalization estimate ──────────────────────────
function cannibalizationRate(seoAvgPosition) {
  if (seoAvgPosition <= 0) return 0.05;
  if (seoAvgPosition <= 1.5) return 0.75;
  if (seoAvgPosition <= 3) return 0.50;
  if (seoAvgPosition <= 5) return 0.30;
  if (seoAvgPosition <= 10) return 0.15;
  return 0.05;
}

// ─── Aggregate GSC daily rows ──────────────────────────
function aggregateGsc(dailyRows) {
  const sum = {
    impressions: 0, clicks: 0,
    exact_imp: 0, variant_imp: 0, plus_kw_imp: 0,
    exact_clk: 0, variant_clk: 0, plus_kw_clk: 0,
    non_brand_imp: 0, non_brand_clk: 0,
    _pos_w: 0, _pos_weight: 0,
  };
  for (const d of dailyRows) {
    sum.impressions += d.brand_impressions;
    sum.clicks += d.brand_clicks;
    sum.exact_imp += d.brand_exact_impressions;
    sum.exact_clk += d.brand_exact_clicks;
    sum.variant_imp += d.brand_variant_impressions;
    sum.variant_clk += d.brand_variant_clicks;
    sum.plus_kw_imp += d.brand_plus_kw_impressions;
    sum.plus_kw_clk += d.brand_plus_kw_clicks;
    sum.non_brand_imp += d.non_brand_impressions;
    sum.non_brand_clk += d.non_brand_clicks;
    sum._pos_w += d._pos_weighted || 0;
    sum._pos_weight += d._pos_weight || 0;
  }
  return {
    ...sum,
    avg_position: sum._pos_weight > 0 ? sum._pos_w / sum._pos_weight : 0,
  };
}

// ─── GET /api/brand/overview ───────────────────────────
router.get('/overview', async (req, res) => {
  try {
    const { brand, from, to } = req.query;
    if (!brand || !from || !to) return res.status(400).json({ error: 'Missing brand/from/to' });

    const brandLabel = resolveBrandLabel(brand);
    if (!GSC_PROPERTIES[brandLabel]) return res.status(400).json({ error: `Unknown brand: ${brand}` });
    const adsBrandKey = resolveAdsBrandKey(brandLabel);
    const excluded = getExcludedCampaignIds(brandLabel);

    // Current period
    const [gscDaily, adsRows] = await Promise.all([
      getGscBrandByDate(brandLabel, from, to),
      fetchAdsBrandCampaigns(adsBrandKey, from, to),
    ]);

    const gsc = aggregateGsc(gscDaily);
    const ads = aggregateAdsBrandRows(adsRows, excluded);

    // Previous period for deltas
    const { compFrom, compTo } = getComparisonDates(from, to);
    const [prevGscDaily, prevAdsRows] = await Promise.all([
      getGscBrandByDate(brandLabel, compFrom, compTo).catch(() => []),
      fetchAdsBrandCampaigns(adsBrandKey, compFrom, compTo).catch(() => []),
    ]);
    const prevGsc = aggregateGsc(prevGscDaily);
    const prevAds = aggregateAdsBrandRows(prevAdsRows, excluded);

    const totalImpressions = gsc.impressions + ads.impressions;
    const totalClicks = gsc.clicks + ads.clicks;
    const prevTotalImpressions = prevGsc.impressions + prevAds.impressions;
    const prevTotalClicks = prevGsc.clicks + prevAds.clicks;

    const seaCoveragePct = pct(ads.impressions, totalImpressions);
    const prevSeaCoveragePct = pct(prevAds.impressions, prevTotalImpressions);

    // Cannibalization
    const rate = cannibalizationRate(gsc.avg_position);
    const cannibalizedClicks = r2(ads.clicks * rate);
    const incrementClicks = r2(ads.clicks - cannibalizedClicks);
    const incrementRevenue = ads.clicks > 0 ? r2((incrementClicks / ads.clicks) * ads.revenue) : 0;
    const incrementalRoas = ads.cost > 0 ? r2(incrementRevenue / ads.cost) : 0;

    // Per-campaign breakdown (current period, no excluded filtering so UI can show all detected)
    const byCampaign = {};
    for (const r of adsRows) {
      const k = r.campaignId || r.campaign;
      if (!byCampaign[k]) {
        byCampaign[k] = {
          campaign_id: String(r.campaignId || ''),
          campaign_name: r.campaign,
          clicks: 0, impressions: 0, cost: 0, conversions: 0, revenue: 0,
          excluded: excluded.has(String(r.campaignId)),
        };
      }
      const b = byCampaign[k];
      b.clicks += r.clicks;
      b.impressions += r.impressions;
      b.cost += r.cost;
      b.conversions += r.conversions;
      b.revenue += r.conversion_value;
    }
    const campaigns = Object.values(byCampaign)
      .map(c => ({ ...c, cost: r2(c.cost), revenue: r2(c.revenue), conversions: r2(c.conversions) }))
      .sort((a, b) => b.cost - a.cost);

    res.json({
      period: { from, to },
      brand: brandLabel,
      brand_demand: {
        gsc_impressions: gsc.impressions,
        gsc_clicks: gsc.clicks,
        gads_impressions: ads.impressions,
        gads_clicks: ads.clicks,
        total_impressions: totalImpressions,
        total_clicks: totalClicks,
        sea_coverage_pct: seaCoveragePct,
        sea_clicks_share_pct: pct(ads.clicks, totalClicks),
        delta_total_impressions: pctChange(totalImpressions, prevTotalImpressions),
        delta_total_clicks: pctChange(totalClicks, prevTotalClicks),
        delta_sea_coverage_pct: r2(seaCoveragePct - prevSeaCoveragePct),
        delta_gsc_impressions: pctChange(gsc.impressions, prevGsc.impressions),
        delta_gads_impressions: pctChange(ads.impressions, prevAds.impressions),
      },
      breakdown: {
        brand_exact_impressions: gsc.exact_imp,
        brand_variant_impressions: gsc.variant_imp,
        brand_plus_kw_impressions: gsc.plus_kw_imp,
        brand_exact_clicks: gsc.exact_clk,
        brand_variant_clicks: gsc.variant_clk,
        brand_plus_kw_clicks: gsc.plus_kw_clk,
      },
      cannibalization: {
        seo_avg_position: r2(gsc.avg_position),
        cannibalization_rate_pct: r2(rate * 100),
        estimated_cannibalized_clicks: cannibalizedClicks,
        sea_increment_clicks: incrementClicks,
        sea_increment_revenue: incrementRevenue,
        sea_cost: r2(ads.cost),
        sea_revenue: r2(ads.revenue),
        incremental_roas: incrementalRoas,
      },
      gads_brand_campaigns: campaigns,
    });
  } catch (err) {
    console.error('Brand overview error:', err);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/brand/trend ──────────────────────────────
function bucketKey(dateStr, granularity) {
  if (granularity === 'month') return dateStr.slice(0, 7);
  if (granularity === 'week') {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d); mon.setDate(diff);
    return fmtDate(mon);
  }
  return dateStr;
}

router.get('/trend', async (req, res) => {
  try {
    const { brand, from, to, granularity = 'day' } = req.query;
    if (!brand || !from || !to) return res.status(400).json({ error: 'Missing brand/from/to' });

    const brandLabel = resolveBrandLabel(brand);
    if (!GSC_PROPERTIES[brandLabel]) return res.status(400).json({ error: `Unknown brand: ${brand}` });
    const adsBrandKey = resolveAdsBrandKey(brandLabel);
    const excluded = getExcludedCampaignIds(brandLabel);

    const [gscDaily, adsRows] = await Promise.all([
      getGscBrandByDate(brandLabel, from, to),
      fetchAdsBrandCampaigns(adsBrandKey, from, to),
    ]);

    const buckets = {};
    function ensure(k) {
      if (!buckets[k]) {
        buckets[k] = {
          date: k,
          gsc_impressions: 0, gsc_clicks: 0,
          gads_impressions: 0, gads_clicks: 0, gads_cost: 0, gads_revenue: 0,
        };
      }
      return buckets[k];
    }

    for (const d of gscDaily) {
      const b = ensure(bucketKey(d.date, granularity));
      b.gsc_impressions += d.brand_impressions;
      b.gsc_clicks += d.brand_clicks;
    }
    for (const r of adsRows) {
      if (excluded.has(String(r.campaignId))) continue;
      const b = ensure(bucketKey(r.date, granularity));
      b.gads_impressions += r.impressions;
      b.gads_clicks += r.clicks;
      b.gads_cost += r.cost;
      b.gads_revenue += r.conversion_value;
    }

    const trend = Object.values(buckets)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(b => {
        const total = b.gsc_impressions + b.gads_impressions;
        return {
          date: b.date,
          gsc_impressions: b.gsc_impressions,
          gsc_clicks: b.gsc_clicks,
          gads_impressions: b.gads_impressions,
          gads_clicks: b.gads_clicks,
          gads_cost: r2(b.gads_cost),
          gads_revenue: r2(b.gads_revenue),
          total_impressions: total,
          sea_coverage_pct: pct(b.gads_impressions, total),
        };
      });

    res.json(trend);
  } catch (err) {
    console.error('Brand trend error:', err);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/brand/campaigns-config ──────────────────
router.post('/campaigns-config', (req, res) => {
  try {
    const { brand, excluded_campaign_ids } = req.body || {};
    if (!brand || !Array.isArray(excluded_campaign_ids)) {
      return res.status(400).json({ error: 'Missing brand or excluded_campaign_ids' });
    }
    const brandLabel = resolveBrandLabel(brand);
    const all = loadOverrides();
    all[brandLabel] = { excluded_campaign_ids: excluded_campaign_ids.map(String) };
    saveOverrides(all);
    res.json({ ok: true, brand: brandLabel, excluded_campaign_ids: all[brandLabel].excluded_campaign_ids });
  } catch (err) {
    console.error('Brand config error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/campaigns-config', (req, res) => {
  const { brand } = req.query;
  const brandLabel = resolveBrandLabel(brand || '');
  const all = loadOverrides();
  res.json(all[brandLabel] || { excluded_campaign_ids: [] });
});

export default router;
