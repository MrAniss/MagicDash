// Deterministic synthetic data generator for demo mode.
//
// Same (brand, market, date) inputs always produce identical output. This is
// crucial: any cached data the frontend stores stays consistent across page
// reloads, and YoY / WoW comparisons line up because the past doesn't change
// from one render to the next.

import { findBrand, demoCampaignId } from './demoConfig.js';

// ─── PRNG ──────────────────────────────────────────────────
// FNV-1a 32-bit hash → mulberry32 PRNG. Pure JS, no deps.

export function hashSeed(...parts) {
  let h = 0x811c9dc5;
  const s = parts.join('|');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function prng(seed) {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

// Single deterministic float in [0,1) for a given seed string.
export function rand01(...parts) {
  const r = prng(hashSeed(...parts));
  return r();
}

// 1 ± range, deterministic noise factor.
export function noise(seed, range = 0.15) {
  return 1 + (rand01(seed) - 0.5) * 2 * range;
}

// ─── Calendar factors ──────────────────────────────────────

function parseDate(dateStr) {
  const [y, m, d] = String(dateStr).split('-').map(n => parseInt(n, 10));
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

// Annual seasonality factor. Beauty/health pattern: Jan low, Mar peak,
// summer dip, Q4 (Black Friday + Christmas) very strong. Range ~0.7-1.35.
export function seasonality(dateStr) {
  const d = parseDate(dateStr);
  const dayOfYear = Math.floor(
    (d - Date.UTC(d.getUTCFullYear(), 0, 0)) / (24 * 3600 * 1000)
  );
  // Two-component cycle: a yearly sine (mild) plus a Q4 bump.
  const x = (dayOfYear / 365) * 2 * Math.PI;
  const yearly = 1 + 0.10 * Math.sin(x - Math.PI / 2.5);
  // Q4 ramp: +25% peaking around Nov 25 (day 329) tapering by Jan 5
  const q4 = (dayOfYear >= 290 && dayOfYear <= 360)
    ? 0.20 * Math.exp(-Math.pow((dayOfYear - 329) / 18, 2))
    : 0;
  // Summer dip: -10% trough mid-July
  const summer = (dayOfYear >= 165 && dayOfYear <= 220)
    ? -0.10 * Math.exp(-Math.pow((dayOfYear - 195) / 15, 2))
    : 0;
  return yearly + q4 + summer;
}

// Day-of-week factor (Mon-Fri stronger, weekend dip).
export function dayOfWeekFactor(dateStr) {
  const d = parseDate(dateStr);
  const dow = d.getUTCDay(); // 0=Sun
  switch (dow) {
    case 0: return 0.85; // Sun
    case 1: return 1.05; // Mon
    case 2: return 1.05; // Tue
    case 3: return 1.05; // Wed
    case 4: return 1.04; // Thu
    case 5: return 1.00; // Fri
    case 6: return 0.88; // Sat
    default: return 1.0;
  }
}

// Multi-year growth: +8% YoY compound, anchored to 2023-01-01.
export function growthTrend(dateStr, baseDate = '2023-01-01') {
  const d = parseDate(dateStr);
  const b = parseDate(baseDate);
  const yearsElapsed = (d - b) / (365.25 * 24 * 3600 * 1000);
  return Math.pow(1.08, yearsElapsed);
}

// ─── Daily totals per (brand, market, date) ────────────────

export function dailyMetrics(brandKey, market, dateStr) {
  const brand = findBrand(brandKey);
  if (!brand) {
    return { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0,
             cpc: 0, ctr: 0, cvr: 0, aov: 0, roas: 0 };
  }
  const mktDef = brand.markets.find(m => m.code === market) || { scale: 0 };
  if (!mktDef.scale) {
    return { spend: 0, clicks: 0, impressions: 0, conversions: 0, revenue: 0,
             cpc: 0, ctr: 0, cvr: 0, aov: 0, roas: 0 };
  }

  const seasFactor = seasonality(dateStr);
  const dowFactor  = dayOfWeekFactor(dateStr);
  const growth     = growthTrend(dateStr);
  const dailyNoise = noise(`day|${brandKey}|${market}|${dateStr}`, 0.12);

  const spend = brand.baselineDailySpend
    * mktDef.scale * seasFactor * dowFactor * growth * dailyNoise;

  // Each metric gets its own small noise so ratios don't collapse to constants
  const cpc  = brand.cpc  * noise(`cpc|${brandKey}|${market}|${dateStr}`, 0.06);
  const ctr  = brand.ctr  * noise(`ctr|${brandKey}|${market}|${dateStr}`, 0.08);
  const cvr  = brand.cvr  * noise(`cvr|${brandKey}|${market}|${dateStr}`, 0.10);
  const aov  = brand.aov  * noise(`aov|${brandKey}|${market}|${dateStr}`, 0.04);

  const clicks       = spend / Math.max(cpc, 0.05);
  const impressions  = clicks / Math.max(ctr, 0.001);
  const conversions  = clicks * cvr;
  const revenue      = conversions * aov;
  const roas         = spend > 0 ? revenue / spend : 0;

  return {
    spend, clicks, impressions, conversions, revenue,
    cpc, ctr, cvr, aov, roas,
  };
}

// Spread daily totals across the brand's campaign templates. Each campaign
// gets `share[i]` of the day's metrics with a small per-campaign noise so
// individual rows look organic without breaking the overall totals.
export function dailyByCampaign(brandKey, market, dateStr) {
  const brand = findBrand(brandKey);
  if (!brand) return [];
  const totals = dailyMetrics(brandKey, market, dateStr);
  if (!totals.spend) return [];

  const rows = [];
  for (const tpl of brand.campaignTemplates) {
    const wobble = noise(`camp|${brandKey}|${market}|${tpl.name}|${dateStr}`, 0.18);
    const sShare = tpl.share * wobble;
    const spend       = totals.spend       * sShare;
    const clicks      = totals.clicks      * sShare;
    const impressions = totals.impressions * sShare;
    const conversions = totals.conversions * sShare * noise(`cnv|${brandKey}|${market}|${tpl.name}|${dateStr}`, 0.20);
    const revenue     = conversions * totals.aov * noise(`rev|${brandKey}|${market}|${tpl.name}|${dateStr}`, 0.05);

    rows.push({
      date:        dateStr,
      brand:       brandKey,
      market,
      campaign:    tpl.name,
      campaignId:  demoCampaignId(brandKey, market, tpl.name),
      campaignType: tpl.type,
      spend,
      clicks,
      impressions,
      conversions,
      revenue,
      cpc:  totals.cpc,
      ctr:  totals.ctr * 100, // percentage form, matches real client
      cvr:  clicks > 0 ? (conversions / clicks) * 100 : 0,
      aov:  conversions > 0 ? revenue / conversions : 0,
      roas: spend > 0 ? revenue / spend : 0,
    });
  }
  return rows;
}

// Iterate every YYYY-MM-DD between from..to inclusive (UTC).
export function eachDate(from, to) {
  const start = parseDate(from);
  const end   = parseDate(to);
  const out = [];
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}
