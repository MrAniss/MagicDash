// Demo mock for backend/googleAdsClient.js. Every public function returns a
// payload whose shape matches the real client exactly, generated from
// demoSeed.js's deterministic PRNG.

import { DEMO_BRANDS, findBrand, demoAccountId, demoCampaignId, DEMO_BRAND_LABELS } from './demoConfig.js';
import { dailyByCampaign, dailyMetrics, eachDate, noise, rand01 } from './demoSeed.js';

function brandLabel(brandKey) {
  return DEMO_BRAND_LABELS[brandKey] || findBrand(brandKey)?.label || brandKey;
}

function bidTypeFor(campaignType) {
  switch (campaignType) {
    case 'Performance Max': return 'MAXIMIZE_CONVERSION_VALUE';
    case 'Shopping':        return 'MAXIMIZE_CONVERSION_VALUE';
    case 'Display':         return 'TARGET_CPA';
    case 'Video':           return 'TARGET_CPM';
    case 'Demand Gen':      return 'MAXIMIZE_CONVERSIONS';
    default:                return 'TARGET_ROAS';
  }
}

function buildRow(brandKey, market, campaignRow) {
  const accId = demoAccountId(brandKey, market);
  const campaign = campaignRow.campaign;
  const isSearch = campaignRow.campaignType === 'Search';

  // Search-only impression-share metrics. Use deterministic random so values
  // stay stable across renders.
  const isShare    = isSearch ? 0.45 + rand01(`is|${brandKey}|${market}|${campaign}|${campaignRow.date}`) * 0.40 : 0;
  const clkShare   = isSearch ? Math.min(isShare * (0.55 + rand01(`cs|${brandKey}|${market}|${campaign}`) * 0.20), 0.95) : 0;
  const lostBudget = isSearch ? rand01(`lb|${brandKey}|${market}|${campaign}|${campaignRow.date}`) * 0.10 : 0;
  const lostRank   = isSearch ? Math.max(0, 1 - isShare - lostBudget) : 0;
  const absTop     = isSearch ? Math.min(0.95, isShare * (0.45 + rand01(`at|${brandKey}|${market}|${campaign}`) * 0.30)) : 0;
  const top        = isSearch ? Math.min(0.95, isShare * (0.65 + rand01(`tp|${brandKey}|${market}|${campaign}`) * 0.25)) : 0;

  return {
    date: campaignRow.date,
    account: `${brandLabel(brandKey)} ${market}`,
    brand: brandKey,
    brandLabel: brandLabel(brandKey),
    market,
    accountId: accId,
    campaign,
    campaignId: campaignRow.campaignId,
    campaign_status: 'Active',
    campaign_type: campaignRow.campaignType,
    bidType: bidTypeFor(campaignRow.campaignType),
    impressions: Math.round(campaignRow.impressions),
    clicks: Math.round(campaignRow.clicks),
    ctr: campaignRow.ctr,
    cost: Math.round(campaignRow.spend * 100) / 100,
    conversion_value: Math.round(campaignRow.revenue * 100) / 100,
    conversions: Math.round(campaignRow.conversions * 100) / 100,
    roas: Math.round(campaignRow.roas * 100) / 100,
    clickShare: clkShare,
    searchImpressionShare: isShare,
    searchRankLostImpressionShare: lostRank,
    searchBudgetLostImpressionShare: lostBudget,
    absoluteTopImpressionPercentage: absTop,
    topImpressionPercentage: top,
    comarket: campaignRow.comarket,
  };
}

function brandKeysForFilter(brandFilter) {
  if (!brandFilter || brandFilter === 'ALL') return DEMO_BRANDS.map(b => b.key);
  return [brandFilter];
}

// ─── Public API ────────────────────────────────────────────

export async function getRows({ brand = 'ALL', market = 'ALL', from, to, campaignType, includeComarket = false } = {}) {
  if (!from || !to) return [];
  const brandKeys = brandKeysForFilter(brand);
  const dates = eachDate(from, to);
  const out = [];

  for (const bKey of brandKeys) {
    const bDef = findBrand(bKey);
    if (!bDef) continue;
    const markets = market === 'ALL'
      ? bDef.markets.map(m => m.code)
      : bDef.markets.filter(m => m.code === market).map(m => m.code);
    for (const m of markets) {
      for (const date of dates) {
        const camps = dailyByCampaign(bKey, m, date);
        for (const c of camps) {
          if (!includeComarket && c.comarket) continue;
          out.push(buildRow(bKey, m, c));
        }
      }
    }
  }

  let filtered = out;
  if (campaignType && campaignType !== 'ALL') {
    if (campaignType === 'DSA') {
      filtered = filtered.filter(r => r.campaign.toLowerCase().includes('dsa'));
    } else {
      filtered = filtered.filter(r => r.campaign_type === campaignType);
    }
  }

  filtered.sort((a, b) => a.date.localeCompare(b.date));
  console.log(`Google Ads API: ${filtered.length} rows fetched (brand=${brand}, ${from} to ${to})`);
  return filtered;
}

// ─── Signal rows ───────────────────────────────────────────

export async function getSignalRows(brand, dateFrom, dateTo) {
  const brandKeys = brandKeysForFilter(brand);
  const dates = eachDate(dateFrom, dateTo);
  // Aggregate per (brand, market, campaign) over the window
  const acc = {};
  for (const bKey of brandKeys) {
    const bDef = findBrand(bKey);
    if (!bDef) continue;
    for (const m of bDef.markets) {
      for (const date of dates) {
        for (const c of dailyByCampaign(bKey, m.code, date)) {
          if (c.comarket) continue;
          const key = `${bKey}|${m.code}|${c.campaignId}`;
          if (!acc[key]) {
            acc[key] = {
              brand: bKey,
              brandLabel: brandLabel(bKey),
              market: m.code,
              campaign: c.campaign,
              campaignId: c.campaignId,
              campaignType: c.campaignType,
              cost: 0,
              conversions_value: 0,
              clicks: 0,
              impressions: 0,
              targetRoas: c.campaignType === 'Performance Max' || c.campaignType === 'Shopping' ? 4.0 : 0,
            };
          }
          acc[key].cost              += c.spend;
          acc[key].conversions_value += c.revenue;
          acc[key].clicks            += c.clicks;
          acc[key].impressions       += c.impressions;
        }
      }
    }
  }
  return Object.values(acc).map(r => ({
    ...r,
    roas: r.cost > 0 ? r.conversions_value / r.cost : 0,
    clickShare: r.campaignType === 'Search'
      ? 0.55 + rand01(`sigcs|${r.brand}|${r.market}|${r.campaignId}`) * 0.30
      : 0,
  }));
}

// ─── Campaign audit (7d/30d/90d) ───────────────────────────

function aggregateWindow(brandKey, market, days) {
  const today = new Date();
  const out = {};
  for (let i = 0; i < days; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i - 1);
    const ds = d.toISOString().slice(0, 10);
    for (const c of dailyByCampaign(brandKey, market, ds)) {
      if (c.comarket) continue;
      const id = c.campaignId;
      if (!out[id]) {
        out[id] = {
          campaign_id: id, campaign_name: c.campaign, campaign_type: c.campaignType,
          market, brand: brandKey, brandLabel: brandLabel(brandKey),
          bid_strategy: bidTypeFor(c.campaignType),
          target_roas: c.campaignType === 'Performance Max' || c.campaignType === 'Shopping' ? 4.0 : 0,
          budget_daily: 0,
          cost: 0, conv_value: 0, conversions: 0, clicks: 0, impressions: 0, click_share: 0,
        };
      }
      out[id].cost += c.spend;
      out[id].conv_value += c.revenue;
      out[id].conversions += c.conversions;
      out[id].clicks += c.clicks;
      out[id].impressions += c.impressions;
    }
  }
  return out;
}

export async function getCampaignAuditData(brand) {
  const brandKeys = brandKeysForFilter(brand);
  const merged = {};

  for (const bKey of brandKeys) {
    const bDef = findBrand(bKey);
    if (!bDef) continue;
    for (const m of bDef.markets) {
      const w7  = aggregateWindow(bKey, m.code, 7);
      const w30 = aggregateWindow(bKey, m.code, 30);
      const w90 = aggregateWindow(bKey, m.code, 90);

      const ids = new Set([...Object.keys(w7), ...Object.keys(w30), ...Object.keys(w90)]);
      for (const id of ids) {
        const base = w30[id] || w7[id] || w90[id];
        if (!base) continue;
        const dailyAvg = (w30[id]?.cost || 0) / 30;
        merged[id] = {
          campaign_id: base.campaign_id,
          campaign_name: base.campaign_name,
          campaign_type: base.campaign_type,
          market: base.market,
          brand: base.brand,
          brandLabel: base.brandLabel,
          bid_strategy: base.bid_strategy,
          target_roas: base.target_roas,
          budget_daily: Math.round(dailyAvg * 1.10 * 100) / 100,
          cost_7d:        w7[id]?.cost        || 0,
          cost_30d:       w30[id]?.cost       || 0,
          cost_90d:       w90[id]?.cost       || 0,
          conv_value_7d:  w7[id]?.conv_value  || 0,
          conv_value_30d: w30[id]?.conv_value || 0,
          conv_value_90d: w90[id]?.conv_value || 0,
          conversions_7d:  Math.round((w7[id]?.conversions  || 0) * 100) / 100,
          conversions_30d: Math.round((w30[id]?.conversions || 0) * 100) / 100,
          conversions_90d: Math.round((w90[id]?.conversions || 0) * 100) / 100,
          clicks_7d:       Math.round(w7[id]?.clicks  || 0),
          clicks_30d:      Math.round(w30[id]?.clicks || 0),
          clicks_90d:      Math.round(w90[id]?.clicks || 0),
          impressions_7d:  Math.round(w7[id]?.impressions  || 0),
          impressions_30d: Math.round(w30[id]?.impressions || 0),
          impressions_90d: Math.round(w90[id]?.impressions || 0),
        };
        const c = merged[id];
        c.roas_7d  = c.cost_7d  > 0 ? Math.round((c.conv_value_7d  / c.cost_7d)  * 100) / 100 : 0;
        c.roas_30d = c.cost_30d > 0 ? Math.round((c.conv_value_30d / c.cost_30d) * 100) / 100 : 0;
        c.roas_90d = c.cost_90d > 0 ? Math.round((c.conv_value_90d / c.cost_90d) * 100) / 100 : 0;
        c.clicks_30d_daily = c.clicks_30d > 0 ? c.clicks_30d / 30 : 0;
        if (base.campaign_type === 'Search') {
          c.click_share_7d  = 0.55 + rand01(`cs7|${id}`)  * 0.30;
          c.click_share_30d = 0.55 + rand01(`cs30|${id}`) * 0.30;
          c.click_share_90d = 0.55 + rand01(`cs90|${id}`) * 0.30;
        }
      }
    }
  }

  return Object.values(merged);
}

// ─── Shopping ──────────────────────────────────────────────

const PRODUCT_TITLES = [
  'Hydra-Boost Serum 30ml', 'Vitamin C Cream', 'Daily Multivitamin x60',
  'Niacinamide 10% Serum', 'SPF 50 Sunscreen', 'Hair Growth Shampoo 250ml',
  'Retinol Night Cream', 'Collagen Powder x30', 'Omega-3 Capsules x90',
  'Magnesium Glycinate x60', 'Probiotic Daily x30', 'Argan Oil 50ml',
  'Lip Balm Duo', 'Face Mist 100ml', 'Anti-Aging Eye Cream',
  'Cleansing Foam 200ml', 'Body Lotion 400ml', 'Hair Mask 250ml',
  'Sleeping Mask 50g', 'Toner 200ml',
];

function generateProductCatalog(brandKey, market, count) {
  const items = [];
  for (let i = 0; i < count; i++) {
    const titleBase = PRODUCT_TITLES[i % PRODUCT_TITLES.length];
    const idx = Math.floor(i / PRODUCT_TITLES.length);
    items.push({
      item_id:  `DEMO-${brandKey}-${market}-${1000 + i}`,
      title:    idx > 0 ? `${titleBase} v${idx + 1}` : titleBase,
      product_brand: brandLabel(brandKey),
      category_l1: i % 3 === 0 ? 'Beauty & Personal Care' : i % 3 === 1 ? 'Health' : 'Wellness',
    });
  }
  return items;
}

export async function getShoppingData(brand, market, from, to) {
  const bKey = (brand || '').toUpperCase();
  const brandKeys = brandKeysForFilter(bKey === '' ? 'ALL' : bKey);
  const out = [];

  for (const k of brandKeys) {
    const bDef = findBrand(k);
    if (!bDef) continue;
    const markets = market === 'ALL'
      ? bDef.markets.map(m => m.code)
      : bDef.markets.filter(m => m.code === market).map(m => m.code);
    for (const m of markets) {
      const products = generateProductCatalog(k, m, 80);
      // Aggregate Shopping campaign daily metrics across the date range, then
      // distribute proportionally across products (Pareto: top 20% take 60%).
      const dates = eachDate(from, to);
      let totalSpend = 0, totalClicks = 0, totalImpr = 0, totalConv = 0, totalRev = 0;
      for (const date of dates) {
        for (const c of dailyByCampaign(k, m, date)) {
          if (c.campaignType !== 'Shopping') continue;
          totalSpend  += c.spend;
          totalClicks += c.clicks;
          totalImpr   += c.impressions;
          totalConv   += c.conversions;
          totalRev    += c.revenue;
        }
      }
      // Distribute across products with a power-law weight
      const weights = products.map((_, i) => 1 / Math.pow(i + 1, 0.65));
      const wSum = weights.reduce((a, b) => a + b, 0);
      products.forEach((p, i) => {
        const w = weights[i] / wSum;
        const wobble = noise(`shop|${k}|${m}|${p.item_id}`, 0.18);
        out.push({
          brand: k,
          brandLabel: brandLabel(k),
          market: m,
          item_id: p.item_id,
          title: p.title,
          product_brand: p.product_brand,
          category_l1: p.category_l1,
          impressions: Math.round(totalImpr * w * wobble),
          clicks: Math.round(totalClicks * w * wobble),
          cost: Math.round(totalSpend * w * wobble * 100) / 100,
          conversions: Math.round(totalConv * w * wobble * 100) / 100,
          revenue: Math.round(totalRev * w * wobble * 100) / 100,
        });
      });
    }
  }

  console.log(`Google Ads API Shopping: ${out.length} rows fetched (brand=${bKey}, market=${market}, ${from} to ${to})`);
  return out;
}

// ─── Scoring (BRAND_A FR PMax buckets) ─────────────────────

export async function getScoringData(from, to) {
  const dates = eachDate(from, to);
  const buckets = {
    TOP_MIDDLE: { scoring: 'TOP_MIDDLE', label: 'Top/Middle', color: '#00B87A', order: 1, cost: 0, revenue: 0, margin: 0, impressions: 0, clicks: 0, conversions: 0, count: 0 },
    FLOP:       { scoring: 'FLOP',       label: 'Flop',       color: '#E8524A', order: 2, cost: 0, revenue: 0, margin: 0, impressions: 0, clicks: 0, conversions: 0, count: 0 },
    ZOMBIE:     { scoring: 'ZOMBIE',     label: 'Zombie',     color: '#8896B0', order: 3, cost: 0, revenue: 0, margin: 0, impressions: 0, clicks: 0, conversions: 0, count: 0 },
  };
  // Map our two PMax templates to buckets and synthesize a "ZOMBIE" bucket.
  const mapping = {
    'PMax - Top Sellers':  'TOP_MIDDLE',
    'PMax - New Arrivals': 'FLOP',
  };
  const counted = new Set();
  for (const date of dates) {
    for (const c of dailyByCampaign('BRAND_A', 'FR', date)) {
      const bucket = mapping[c.campaign];
      if (!bucket) continue;
      const b = buckets[bucket];
      b.cost        += c.spend;
      b.revenue     += c.revenue;
      b.margin      += c.revenue * 0.42; // demo margin assumption
      b.impressions += c.impressions;
      b.clicks      += c.clicks;
      b.conversions += c.conversions;
      const k = `${bucket}|${c.campaignId}`;
      if (!counted.has(k)) { counted.add(k); b.count++; }
    }
  }
  // Synthesize a small Zombie bucket (paused-ish, low traffic).
  const z = buckets.ZOMBIE;
  z.cost = 120 + rand01(`zombie|cost|${from}|${to}`) * 250;
  z.revenue = z.cost * (0.35 + rand01(`zombie|rev|${from}|${to}`) * 0.50);
  z.margin = z.revenue * 0.40;
  z.impressions = Math.round(2000 + rand01(`zombie|imp`) * 4000);
  z.clicks = Math.round(40 + rand01(`zombie|clk`) * 80);
  z.conversions = Math.round((z.revenue / 65) * 100) / 100;
  z.count = 2;

  return Object.values(buckets).sort((a, b) => a.order - b.order);
}

// ─── Comarket ──────────────────────────────────────────────

export async function getComarketRows({ from, to } = {}) {
  // Comarket campaigns only exist in BRAND_A FR (per the demo config).
  const dates = eachDate(from, to);
  const out = [];
  for (const date of dates) {
    for (const c of dailyByCampaign('BRAND_A', 'FR', date)) {
      if (!c.comarket) continue;
      out.push(buildRow('BRAND_A', 'FR', c));
    }
  }
  return out;
}

// ─── Competition ───────────────────────────────────────────

export async function getCompetitionData(brand, dateFrom, dateTo) {
  const brandKeys = brandKeysForFilter(brand);
  const allOwn = [];
  const allInsights = [];
  const competitorDomains = ['competitor-a.example', 'competitor-b.example', 'competitor-c.example', 'partner.example', 'pure-player.example'];

  for (const bKey of brandKeys) {
    const bDef = findBrand(bKey);
    if (!bDef) continue;
    for (const m of bDef.markets) {
      // Aggregate per channel-type for this market over the date window.
      const totals = { Search: { impressions: 0, cost: 0 }, Shopping: { impressions: 0, cost: 0 }, 'Performance Max': { impressions: 0, cost: 0 } };
      for (const date of eachDate(dateFrom, dateTo)) {
        for (const c of dailyByCampaign(bKey, m.code, date)) {
          if (c.comarket) continue;
          if (!totals[c.campaignType]) continue;
          totals[c.campaignType].impressions += c.impressions;
          totals[c.campaignType].cost        += c.spend;
        }
      }
      for (const [type, d] of Object.entries(totals)) {
        if (d.impressions === 0) continue;
        const isPMax = type === 'Performance Max';
        allOwn.push({
          market: m.code,
          channelType: type,
          isPMax,
          impressions: Math.round(d.impressions),
          cost: Math.round(d.cost * 100) / 100,
          impression_share: !isPMax ? 0.45 + rand01(`compis|${bKey}|${m.code}|${type}`) * 0.40 : null,
          click_share:      !isPMax ? 0.50 + rand01(`compcs|${bKey}|${m.code}|${type}`) * 0.30 : null,
          lost_budget:      !isPMax ? rand01(`complb|${bKey}|${m.code}|${type}`) * 0.10 : null,
          lost_rank:        !isPMax ? rand01(`complr|${bKey}|${m.code}|${type}`) * 0.20 : null,
          abs_top_share:    !isPMax ? 0.20 + rand01(`compat|${bKey}|${m.code}|${type}`) * 0.30 : null,
          top_share:        !isPMax ? 0.40 + rand01(`compts|${bKey}|${m.code}|${type}`) * 0.30 : null,
        });
      }
      // Auction insights: synthesize a few competitors for Search + Shopping
      for (const type of ['Search', 'Shopping']) {
        for (const dom of competitorDomains) {
          allInsights.push({
            market: m.code,
            domain: dom,
            channelType: type,
            impression_share: 0.05 + rand01(`auis|${bKey}|${m.code}|${type}|${dom}`) * 0.40,
            overlap_rate:     0.10 + rand01(`auor|${bKey}|${m.code}|${type}|${dom}`) * 0.50,
            position_above:   rand01(`aupa|${bKey}|${m.code}|${type}|${dom}`) * 0.40,
            top_share:        0.20 + rand01(`auts|${bKey}|${m.code}|${type}|${dom}`) * 0.40,
            outranking_share: rand01(`auos|${bKey}|${m.code}|${type}|${dom}`) * 0.50,
          });
        }
      }
    }
  }
  return { own: allOwn, insights: allInsights };
}

export async function getCompetitionTrendData(brand, market, dateFrom, dateTo) {
  const brandKeys = brandKeysForFilter(brand);
  const out = [];
  for (const bKey of brandKeys) {
    const bDef = findBrand(bKey);
    if (!bDef) continue;
    const markets = market === 'ALL'
      ? bDef.markets.map(m => m.code)
      : bDef.markets.filter(m => m.code === market).map(m => m.code);
    for (const m of markets) {
      for (const date of eachDate(dateFrom, dateTo)) {
        // One row per (market, day, isPMax)
        let searchImpr = 0, searchCost = 0, pmaxImpr = 0, pmaxCost = 0;
        for (const c of dailyByCampaign(bKey, m, date)) {
          if (c.campaignType === 'Performance Max') {
            pmaxImpr += c.impressions; pmaxCost += c.spend;
          } else if (c.campaignType === 'Search' || c.campaignType === 'Shopping') {
            searchImpr += c.impressions; searchCost += c.spend;
          }
        }
        if (searchImpr > 0) {
          out.push({
            date, market: m, isPMax: false,
            impressions: Math.round(searchImpr),
            cost: Math.round(searchCost * 100) / 100,
            impression_share: 0.45 + rand01(`tris|${bKey}|${m}|${date}`) * 0.40,
            lost_budget:      rand01(`trlb|${bKey}|${m}|${date}`) * 0.10,
            lost_rank:        rand01(`trlr|${bKey}|${m}|${date}`) * 0.20,
            top_share:        0.40 + rand01(`trts|${bKey}|${m}|${date}`) * 0.30,
          });
        }
        if (pmaxImpr > 0) {
          out.push({
            date, market: m, isPMax: true,
            impressions: Math.round(pmaxImpr),
            cost: Math.round(pmaxCost * 100) / 100,
            impression_share: null, lost_budget: null, lost_rank: null, top_share: null,
          });
        }
      }
    }
  }
  return out;
}

// ─── Cache / setup helpers (no-ops in demo) ────────────────

export function clearCache()         { /* no-op in demo */ }
export function clearAuditCache()    { /* no-op in demo */ }
export function clearShoppingCache() { /* no-op in demo */ }
export function clearScoringCache()  { /* no-op in demo */ }
export function clearCompCache()     { /* no-op in demo */ }

export function getApi()          { return null; }
export function getRefreshToken() { return 'demo-refresh-token'; }
export function getCustomer()     { return null; }
