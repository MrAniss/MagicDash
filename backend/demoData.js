import { BRANDS } from './config/accounts.js';

// Seed-based random for consistent demo data
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function randomBetween(rng, min, max) {
  return min + rng() * (max - min);
}

// Base metrics per market (reflects realistic relative volumes)
const MARKET_WEIGHTS = {
  FR: 1.0, BE: 0.15, NL: 0.12, DE: 0.35, IT: 0.25, ES: 0.20,
  UK: 0.30, AT: 0.08, PT: 0.06, LU: 0.03, SE: 0.07, NO: 0.05,
  FI: 0.04, PL: 0.10, IE: 0.04, RO: 0.05, SA: 0.08, CA: 0.12,
  AU: 0.10, US: 0.28,
};

function getMarketWeight(market) {
  return MARKET_WEIGHTS[market] || 0.1;
}

export function generateKpis({ brand, market, from, to, compareTo }) {
  const seed = hashString(`${brand}-${market}-${from}-${to}`);
  const rng = seededRandom(seed);

  const accounts = getAccounts(brand, market);
  let spend = 0, revenue = 0, conversions = 0, clicks = 0, impressions = 0;

  for (const acc of accounts) {
    const w = getMarketWeight(acc.market);
    const days = daysBetween(from, to);
    const dailySpend = randomBetween(rng, 80, 400) * w;
    spend += dailySpend * days;
    const roas = randomBetween(rng, 2.0, 7.5);
    revenue += dailySpend * days * roas;
    const cpc = randomBetween(rng, 0.15, 0.80);
    clicks += Math.round((dailySpend * days) / cpc);
    const cvr = randomBetween(rng, 0.02, 0.06);
    conversions += Math.round(clicks * cvr);
    impressions += Math.round(clicks / randomBetween(rng, 0.03, 0.08));
  }

  const current = {
    spend: Math.round(spend * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    roas: spend > 0 ? Math.round((revenue / spend) * 100) / 100 : 0,
    conversions: Math.round(conversions),
    cvr: clicks > 0 ? Math.round((conversions / clicks) * 10000) / 100 : 0,
    clicks,
    impressions,
  };

  // Previous period with slight variation
  const prevSeed = hashString(`${brand}-${market}-${from}-${to}-prev-${compareTo}`);
  const prevRng = seededRandom(prevSeed);
  const factor = randomBetween(prevRng, 0.85, 1.15);
  const previous = {
    spend: Math.round(current.spend * factor * 100) / 100,
    revenue: Math.round(current.revenue * randomBetween(prevRng, 0.80, 1.10) * 100) / 100,
    roas: Math.round(current.roas * randomBetween(prevRng, 0.85, 1.12) * 100) / 100,
    conversions: Math.round(current.conversions * randomBetween(prevRng, 0.82, 1.15)),
    cvr: Math.round(current.cvr * randomBetween(prevRng, 0.90, 1.10) * 100) / 100,
    clicks: Math.round(current.clicks * randomBetween(prevRng, 0.85, 1.12)),
    impressions: Math.round(current.impressions * randomBetween(prevRng, 0.88, 1.10)),
  };

  const deltas = {
    spend_pct: pctChange(current.spend, previous.spend),
    revenue_pct: pctChange(current.revenue, previous.revenue),
    roas_abs: Math.round((current.roas - previous.roas) * 100) / 100,
    conversions_pct: pctChange(current.conversions, previous.conversions),
    cvr_abs: Math.round((current.cvr - previous.cvr) * 100) / 100,
    clicks_pct: pctChange(current.clicks, previous.clicks),
    impressions_pct: pctChange(current.impressions, previous.impressions),
  };

  return { current, previous, deltas };
}

export function generateTrend({ brand, market, from, to, compareTo, granularity }) {
  const days = daysBetween(from, to);
  const gran = granularity || (days <= 90 ? 'day' : 'week');
  const seed = hashString(`trend-${brand}-${market}-${from}-${to}`);
  const rng = seededRandom(seed);

  const current = [];
  const d = new Date(from);
  const endDate = new Date(to);

  while (d <= endDate) {
    const dateStr = fmtDate(d);
    const dayOfWeek = d.getDay();
    const weekendFactor = (dayOfWeek === 0 || dayOfWeek === 6) ? 0.6 : 1.0;
    const baseSpend = randomBetween(rng, 400, 2500) * weekendFactor;
    const roas = randomBetween(rng, 2.5, 6.5);

    current.push({
      date: dateStr,
      spend: Math.round(baseSpend * 100) / 100,
      revenue: Math.round(baseSpend * roas * 100) / 100,
      roas: Math.round(roas * 100) / 100,
      conversions: Math.round(randomBetween(rng, 15, 120) * weekendFactor),
    });

    if (gran === 'week') d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
  }

  // Previous period
  const prevRng = seededRandom(seed + 999);
  const previous = current.map(item => ({
    date: item.date,
    spend: Math.round(item.spend * randomBetween(prevRng, 0.80, 1.15) * 100) / 100,
    revenue: Math.round(item.revenue * randomBetween(prevRng, 0.78, 1.12) * 100) / 100,
    roas: Math.round(item.roas * randomBetween(prevRng, 0.85, 1.10) * 100) / 100,
    conversions: Math.round(item.conversions * randomBetween(prevRng, 0.82, 1.18)),
  }));

  return { current, previous };
}

export function generateMarkets({ brand, from, to, compareTo }) {
  const brands = brand === 'ALL' ? Object.values(BRANDS) : BRANDS[brand] ? [BRANDS[brand]] : [];
  const results = [];

  for (const b of brands) {
    for (const acc of b.accounts) {
      const seed = hashString(`market-${acc.market}-${b.name}-${from}-${to}`);
      const rng = seededRandom(seed);
      const w = getMarketWeight(acc.market);
      const days = daysBetween(from, to);

      const dailySpend = randomBetween(rng, 80, 400) * w;
      const spend = dailySpend * days;
      const roas = randomBetween(rng, 1.8, 8.0);
      const revenue = spend * roas;
      const cpc = randomBetween(rng, 0.15, 0.80);
      const clicks = Math.round(spend / cpc);
      const cvr = randomBetween(rng, 0.02, 0.06);
      const conversions = Math.round(clicks * cvr);

      const prevRng = seededRandom(seed + 777);
      const prevRoas = roas * randomBetween(prevRng, 0.85, 1.15);
      const prevSpend = spend * randomBetween(prevRng, 0.85, 1.15);

      results.push({
        market: acc.market,
        label: acc.label,
        brand: b.name,
        spend: Math.round(spend * 100) / 100,
        revenue: Math.round(revenue * 100) / 100,
        roas: Math.round(roas * 100) / 100,
        conversions,
        cvr: Math.round(cvr * 10000) / 100,
        delta_roas: Math.round((roas - prevRoas) * 100) / 100,
        delta_spend: Math.round(((spend - prevSpend) / prevSpend) * 10000) / 100,
      });
    }
  }

  return results;
}

export function generateCampaigns({ brand, market, from, to, type }) {
  const accounts = getAccounts(brand, market);
  const campaignTypes = ['PMax', 'Shopping', 'Search', 'DSA'];
  const campaigns = [];
  const seed = hashString(`campaigns-${brand}-${market}-${from}-${to}-${type}`);
  const rng = seededRandom(seed);

  const campaignNames = {
    PMax: ['PMax - Best Sellers', 'PMax - New Products', 'PMax - Seasonal', 'PMax - Top Categories', 'PMax - High Margin'],
    Shopping: ['Shopping - Standard', 'Shopping - Smart', 'Shopping - Feed Optimized', 'Shopping - Promos'],
    Search: ['Search - Brand', 'Search - Generic', 'Search - Competitors', 'Search - Long Tail'],
    DSA: ['DSA - All Pages', 'DSA - Categories', 'DSA - Blog Content'],
  };

  for (const acc of accounts) {
    const w = getMarketWeight(acc.market);
    const types = type === 'ALL' ? campaignTypes : [type];

    for (const t of types) {
      const names = campaignNames[t] || [`${t} - Default`];
      for (const name of names) {
        const fullName = `[${acc.market}] ${name}`;
        const spend = randomBetween(rng, 200, 5000) * w;
        const roas = randomBetween(rng, 1.5, 9.0);
        const cpc = randomBetween(rng, 0.10, 1.20);
        const clicks = Math.round(spend / cpc);
        const cvr = randomBetween(rng, 0.015, 0.07);
        const conversions = Math.round(clicks * cvr);
        const impressions = Math.round(clicks / randomBetween(rng, 0.02, 0.09));

        campaigns.push({
          campaign_name: fullName,
          type: t,
          status: rng() > 0.15 ? 'ENABLED' : 'PAUSED',
          spend: Math.round(spend * 100) / 100,
          revenue: Math.round(spend * roas * 100) / 100,
          roas: Math.round(roas * 100) / 100,
          conversions,
          cvr: Math.round(cvr * 10000) / 100,
          impressions,
          clicks,
          ctr: Math.round((clicks / impressions) * 10000) / 100,
        });
      }
    }
  }

  campaigns.sort((a, b) => b.spend - a.spend);
  return campaigns;
}

export function generateBudget({ brand, month }) {
  const [year, mon] = month.split('-').map(Number);
  const firstDay = new Date(year, mon - 1, 1);
  const lastDay = new Date(year, mon, 0);
  const today = new Date();
  const endDate = today < lastDay ? today : lastDay;

  const daysElapsed = Math.floor((endDate - firstDay) / (1000 * 60 * 60 * 24)) + 1;
  const daysTotal = lastDay.getDate();

  const seed = hashString(`budget-${brand}-${month}`);
  const rng = seededRandom(seed);

  const dailySpend = randomBetween(rng, 500, 3000);
  const spendToDate = Math.round(dailySpend * daysElapsed * randomBetween(rng, 0.9, 1.1) * 100) / 100;
  const projectionBase = Math.round((spendToDate / daysElapsed) * daysTotal * 100) / 100;

  return {
    spend_to_date: spendToDate,
    budget_monthly: null,
    days_elapsed: daysElapsed,
    days_total: daysTotal,
    pacing_pct: null,
    projection_base: projectionBase,
    projection_optimistic: Math.round(projectionBase * 1.15 * 100) / 100,
    projection_pessimistic: Math.round(projectionBase * 0.85 * 100) / 100,
  };
}

// Helpers

function getAccounts(brand, market) {
  const brands = brand === 'ALL' ? Object.values(BRANDS) : BRANDS[brand] ? [BRANDS[brand]] : [];
  const accounts = [];
  for (const b of brands) {
    for (const acc of b.accounts) {
      if (!market || market === 'ALL' || acc.market === market) {
        accounts.push({ ...acc, mode: b.mode });
      }
    }
  }
  return accounts;
}

function daysBetween(from, to) {
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1);
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash = hash & hash; // 32-bit
  }
  return Math.abs(hash);
}
