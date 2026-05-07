// Demo mock for backend/ga4Client.js. Reuses the demoSeed daily totals so
// GA4 numbers and Google Ads numbers stay internally consistent (the same
// growth/seasonality/dow factors apply).

import { findBrand, DEMO_BRANDS, DEMO_BRAND_LABELS } from './demoConfig.js';
import { dailyMetrics, dailyByCampaign, eachDate, rand01, noise } from './demoSeed.js';

// GA4 sessions are typically 5-8x clicks (organic + direct + everything else
// dwarfs paid). We use 6.5x as the multiplier and let market scale modulate it.
const SESSION_MULTIPLIER = 6.5;

function r2(v) { return Math.round(v * 100) / 100; }

function brandKeysForFilter(brand) {
  if (!brand || brand === 'ALL') return DEMO_BRANDS.map(b => b.key);
  return [brand];
}

function dailyGA4(brandKey, market, date, sourceMedium) {
  // Take the paid daily totals, then expand to total site sessions with the
  // multiplier. If sourceMedium is set to 'google / cpc' we return the
  // paid-only slice (clicks ≈ sessions for paid).
  const paid = dailyMetrics(brandKey, market, date);
  const isPaidOnly = sourceMedium === 'google / cpc';
  // For a non-paid filter (Organic Search, Direct, etc.) we still use the same
  // baseline times the multiplier so the demo exec gets a coherent funnel.
  const sessions = isPaidOnly
    ? paid.clicks
    : paid.clicks * SESSION_MULTIPLIER;
  const transactions = isPaidOnly
    ? paid.conversions
    : paid.conversions * SESSION_MULTIPLIER * 0.65;
  const revenue = transactions * paid.aov;
  const users = sessions * (0.78 + rand01(`u|${brandKey}|${market}|${date}`) * 0.10);
  const newCustomers = transactions * (0.30 + rand01(`nc|${brandKey}|${market}|${date}`) * 0.15);
  const bounceRate = 0.32 + rand01(`br|${brandKey}|${market}|${date}`) * 0.10;
  return {
    sessions, transactions, revenue, users, newCustomers, bounceRate,
    aov: paid.aov,
  };
}

function aggregateRange(brandKey, market, from, to, sourceMedium) {
  const dates = eachDate(from, to);
  let sessions = 0, transactions = 0, revenue = 0, users = 0, newCustomers = 0, weightedBounce = 0;
  for (const date of dates) {
    const d = dailyGA4(brandKey, market, date, sourceMedium);
    sessions     += d.sessions;
    transactions += d.transactions;
    revenue      += d.revenue;
    users        += d.users;
    newCustomers += d.newCustomers;
    weightedBounce += d.bounceRate * d.sessions;
  }
  return {
    sessions: Math.round(sessions),
    users: Math.round(users),
    newCustomers: Math.round(newCustomers),
    transactions: Math.round(transactions),
    revenue: r2(revenue),
    bounceRate: sessions > 0 ? r2((weightedBounce / sessions) * 100) : 0,
    cvr: sessions > 0 ? r2((transactions / sessions) * 100) : 0,
    aov: transactions > 0 ? r2(revenue / transactions) : 0,
  };
}

function expandMarkets(brandKey, market) {
  const bDef = findBrand(brandKey);
  if (!bDef) return [];
  if (market && market !== 'ALL') {
    return bDef.markets.filter(m => m.code === market).map(m => m.code);
  }
  return bDef.markets.map(m => m.code);
}

// ─── Public API ────────────────────────────────────────────

export async function getGA4Kpis({ brand = 'ALL', market = 'ALL', from, to, sourceMedium } = {}) {
  if (!from || !to) return aggregateRange('BRAND_A', 'FR', '2024-01-01', '2024-01-01');
  const brandKeys = brandKeysForFilter(brand);
  let agg = { sessions: 0, users: 0, newCustomers: 0, transactions: 0, revenue: 0, weightedBounce: 0 };
  for (const bKey of brandKeys) {
    for (const m of expandMarkets(bKey, market)) {
      const r = aggregateRange(bKey, m, from, to, sourceMedium);
      agg.sessions     += r.sessions;
      agg.users        += r.users;
      agg.newCustomers += r.newCustomers;
      agg.transactions += r.transactions;
      agg.revenue      += r.revenue;
      agg.weightedBounce += r.bounceRate * r.sessions;
    }
  }
  const result = {
    sessions: agg.sessions,
    users: agg.users,
    newCustomers: agg.newCustomers,
    transactions: agg.transactions,
    revenue: r2(agg.revenue),
    bounceRate: agg.sessions > 0 ? r2(agg.weightedBounce / agg.sessions) : 0,
    cvr: agg.sessions > 0 ? r2((agg.transactions / agg.sessions) * 100) : 0,
    aov: agg.transactions > 0 ? r2(agg.revenue / agg.transactions) : 0,
  };
  console.log(`GA4 KPIs: ${eachDate(from, to).length} rows (brand=${brand}, mkt=${market}, ${from} to ${to}) → ${result.sessions} sessions`);
  return result;
}

function granularityKey(dateStr, gran) {
  if (gran === 'month') return dateStr.slice(0, 7);
  if (gran === 'week') {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().slice(0, 10);
  }
  return dateStr;
}

export async function getGA4Trend({ brand = 'ALL', market = 'ALL', from, to, granularity = 'day', sourceMedium } = {}) {
  if (!from || !to) return [];
  const brandKeys = brandKeysForFilter(brand);
  const grouped = {};
  for (const bKey of brandKeys) {
    for (const m of expandMarkets(bKey, market)) {
      for (const date of eachDate(from, to)) {
        const d = dailyGA4(bKey, m, date, sourceMedium);
        const key = granularityKey(date, granularity);
        if (!grouped[key]) grouped[key] = { sessions: 0, totalRevenue: 0, transactions: 0 };
        grouped[key].sessions     += d.sessions;
        grouped[key].totalRevenue += d.revenue;
        grouped[key].transactions += d.transactions;
      }
    }
  }
  return Object.entries(grouped).map(([date, d]) => ({
    date,
    sessions: Math.round(d.sessions),
    revenue: r2(d.totalRevenue),
    transactions: Math.round(d.transactions),
    cvr: d.sessions > 0 ? r2((d.transactions / d.sessions) * 100) : 0,
    aov: d.transactions > 0 ? r2(d.totalRevenue / d.transactions) : 0,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// Channel mix used to split the aggregate across default-channel-groups.
const CHANNEL_MIX = [
  { channel: 'Paid Search',     share: 0.35 },
  { channel: 'Organic Search',  share: 0.22 },
  { channel: 'Direct',          share: 0.18 },
  { channel: 'Paid Social',     share: 0.08 },
  { channel: 'Organic Social',  share: 0.05 },
  { channel: 'Email',           share: 0.05 },
  { channel: 'Referral',        share: 0.04 },
  { channel: 'Display',         share: 0.03 },
];

export async function getGA4Channels({ brand = 'ALL', market = 'ALL', from, to, compFrom, compTo, sourceMedium } = {}) {
  if (!from || !to) return [];

  const total = await getGA4Kpis({ brand, market, from, to, sourceMedium });
  const compTotal = (compFrom && compTo)
    ? await getGA4Kpis({ brand, market, from: compFrom, to: compTo, sourceMedium })
    : null;

  function pct(cur, prev) {
    if (!prev) return cur > 0 ? 100 : 0;
    return r2(((cur - prev) / prev) * 100);
  }

  return CHANNEL_MIX.map((cm, idx) => {
    // Slight per-channel bias for transactions vs sessions so CVR varies
    const txnBias = [1.4, 0.9, 1.2, 0.6, 0.5, 1.5, 1.1, 0.7][idx] || 1;
    const sessions     = Math.round(total.sessions     * cm.share);
    const users        = Math.round(total.users        * cm.share);
    const newCustomers = Math.round(total.newCustomers * cm.share * txnBias);
    const revenue      = r2(total.revenue              * cm.share * txnBias);
    const transactions = Math.round(total.transactions * cm.share * txnBias);

    let p = { sessions: 0, users: 0, newCustomers: 0, revenue: 0, transactions: 0, cvr: 0, aov: 0, ncRate: 0 };
    if (compTotal) {
      p = {
        sessions:     Math.round(compTotal.sessions     * cm.share),
        users:        Math.round(compTotal.users        * cm.share),
        newCustomers: Math.round(compTotal.newCustomers * cm.share * txnBias),
        revenue:      r2(compTotal.revenue              * cm.share * txnBias),
        transactions: Math.round(compTotal.transactions * cm.share * txnBias),
      };
      p.cvr    = p.sessions > 0 ? r2((p.transactions / p.sessions) * 100) : 0;
      p.aov    = p.transactions > 0 ? r2(p.revenue / p.transactions) : 0;
      p.ncRate = p.transactions > 0 ? r2((p.newCustomers / p.transactions) * 100) : 0;
    }

    const cvr    = sessions > 0 ? r2((transactions / sessions) * 100) : 0;
    const aov    = transactions > 0 ? r2(revenue / transactions) : 0;
    const ncRate = transactions > 0 ? r2((newCustomers / transactions) * 100) : 0;

    return {
      channel: cm.channel,
      sessions, users, newCustomers, revenue, transactions, cvr, aov, ncRate,
      sessionsPct: r2(cm.share * 100),
      delta_sessions:     pct(sessions,     p.sessions),
      delta_users:        pct(users,        p.users),
      delta_newCustomers: pct(newCustomers, p.newCustomers),
      delta_revenue:      pct(revenue,      p.revenue),
      delta_transactions: pct(transactions, p.transactions),
      delta_cvr:          pct(cvr,          p.cvr),
      delta_aov:          pct(aov,          p.aov),
      delta_ncRate:       pct(ncRate,       p.ncRate),
    };
  }).sort((a, b) => b.sessions - a.sessions);
}

export async function getGA4ByCampaign({ brand = 'ALL', market = 'ALL', from, to, sourceMedium } = {}) {
  if (!from || !to) return [];
  const brandKeys = brandKeysForFilter(brand);
  const acc = {};
  for (const bKey of brandKeys) {
    for (const m of expandMarkets(bKey, market)) {
      const dates = eachDate(from, to);
      for (const date of dates) {
        // Reuse Google Ads daily campaign breakdown — campaigns must align so
        // GA4 attribution and the Ads tab agree.
        const camps = dailyByCampaign(bKey, m, date);
        for (const c of camps) {
          if (c.comarket) continue;
          const name = c.campaign;
          if (!acc[name]) acc[name] = { campaignName: name, sessions: 0, transactions: 0, revenue: 0 };
          // Sessions on a paid campaign ≈ clicks; transactions = conversions
          acc[name].sessions += c.clicks;
          acc[name].transactions += c.conversions;
          acc[name].revenue += c.revenue;
        }
      }
    }
  }
  return Object.values(acc).map(r => ({
    campaignName: r.campaignName,
    sessions: Math.round(r.sessions),
    transactions: Math.round(r.transactions),
    revenue: r2(r.revenue),
  }));
}

export async function getGA4Rows({ brand = 'ALL', market = 'ALL', from, to, sourceMedium } = {}) {
  if (!from || !to) return [];
  const brandKeys = brandKeysForFilter(brand);
  const grouped = {};
  for (const bKey of brandKeys) {
    for (const m of expandMarkets(bKey, market)) {
      for (const date of eachDate(from, to)) {
        const d = dailyGA4(bKey, m, date, sourceMedium);
        if (!grouped[date]) grouped[date] = { date, sessions: 0, revenue: 0, transactions: 0, users: 0, bounced: 0, newCustomers: 0 };
        grouped[date].sessions     += d.sessions;
        grouped[date].revenue      += d.revenue;
        grouped[date].transactions += d.transactions;
        grouped[date].users        += d.users;
        grouped[date].bounced      += d.bounceRate * d.sessions;
        grouped[date].newCustomers += d.newCustomers;
      }
    }
  }
  return Object.values(grouped).map(r => ({
    date: r.date,
    sessions: Math.round(r.sessions),
    revenue: r2(r.revenue),
    transactions: Math.round(r.transactions),
    users: Math.round(r.users),
    bounced: r.bounced,
    newCustomers: Math.round(r.newCustomers),
    bounceRate: r.sessions > 0 ? r.bounced / r.sessions : 0,
  })).sort((a, b) => a.date.localeCompare(b.date));
}

// ─── YTD endpoints ─────────────────────────────────────────

function granularitySeries(brand, market, granularity, sourceMedium, fromOverride) {
  const year = new Date().getFullYear();
  const from = fromOverride || `${year}-01-01`;
  const to   = new Date().toISOString().slice(0, 10);
  const brandKeys = brandKeysForFilter(brand);
  const byDay = {};
  for (const bKey of brandKeys) {
    for (const m of expandMarkets(bKey, market)) {
      for (const date of eachDate(from, to)) {
        const d = dailyGA4(bKey, m, date, sourceMedium);
        if (!byDay[date]) byDay[date] = { sessions: 0, transactions: 0, revenue: 0, bounced: 0 };
        byDay[date].sessions     += d.sessions;
        byDay[date].transactions += d.transactions;
        byDay[date].revenue      += d.revenue;
        byDay[date].bounced      += d.bounceRate * d.sessions;
      }
    }
  }
  return { byDay, from, to };
}

export async function getGA4BounceRateYtd({ brand = 'ALL', market = 'ALL', sourceMedium, granularity = 'week' } = {}) {
  const { byDay } = granularitySeries(brand, market, granularity, sourceMedium);
  let series;
  if (granularity === 'day') {
    series = Object.entries(byDay).map(([date, d]) => ({
      date,
      bounce_rate: d.sessions > 0 ? r2(d.bounced / d.sessions) : 0,
      sessions: Math.round(d.sessions),
    })).sort((a, b) => a.date.localeCompare(b.date));
  } else {
    const byWeek = {};
    for (const [date, d] of Object.entries(byDay)) {
      const wk = granularityKey(date, 'week');
      if (!byWeek[wk]) byWeek[wk] = { bounced: 0, sessions: 0 };
      byWeek[wk].bounced  += d.bounced;
      byWeek[wk].sessions += d.sessions;
    }
    series = Object.entries(byWeek).map(([date, d]) => ({
      date,
      bounce_rate: d.sessions > 0 ? r2(d.bounced / d.sessions) : 0,
      sessions: Math.round(d.sessions),
    })).sort((a, b) => a.date.localeCompare(b.date));
  }
  const totW = series.reduce((s, d) => s + d.bounce_rate * d.sessions, 0);
  const totS = series.reduce((s, d) => s + d.sessions, 0);
  const avg  = totS > 0 ? r2(totW / totS) : 0;

  // Trend last 14 vs prev 14
  const today = new Date();
  const d14 = new Date(today); d14.setDate(today.getDate() - 14);
  const d28 = new Date(today); d28.setDate(today.getDate() - 28);
  const fmt = d => d.toISOString().slice(0, 10);
  const dayEntries = Object.entries(byDay).map(([date, d]) => ({
    date, bounce_rate: d.sessions > 0 ? d.bounced / d.sessions : 0, sessions: d.sessions,
  }));
  function weightedAvg(arr) {
    const s = arr.reduce((a, d) => a + d.sessions, 0);
    if (!s) return 0;
    return arr.reduce((a, d) => a + d.bounce_rate * d.sessions, 0) / s;
  }
  const last14 = dayEntries.filter(d => d.date >= fmt(d14));
  const prev14 = dayEntries.filter(d => d.date >= fmt(d28) && d.date < fmt(d14));
  const avgL = weightedAvg(last14);
  const avgP = weightedAvg(prev14);
  return {
    data: series,
    avg,
    trend: avgL > avgP ? 'UP' : 'DOWN',
    delta_pct: avgP > 0 ? r2(((avgL - avgP) / avgP) * 100) : 0,
  };
}

export async function getGA4CvrAovYtd({ brand = 'ALL', market = 'ALL', sourceMedium, granularity = 'week' } = {}) {
  const { byDay } = granularitySeries(brand, market, granularity, sourceMedium);
  let series;
  if (granularity === 'day') {
    series = Object.entries(byDay).map(([date, d]) => ({
      date,
      cvr: d.sessions > 0 ? r2((d.transactions / d.sessions) * 100) : 0,
      aov: d.transactions > 0 ? r2(d.revenue / d.transactions) : 0,
      sessions: Math.round(d.sessions),
    })).sort((a, b) => a.date.localeCompare(b.date));
  } else {
    const byWeek = {};
    for (const [date, d] of Object.entries(byDay)) {
      const wk = granularityKey(date, 'week');
      if (!byWeek[wk]) byWeek[wk] = { sessions: 0, transactions: 0, revenue: 0 };
      byWeek[wk].sessions     += d.sessions;
      byWeek[wk].transactions += d.transactions;
      byWeek[wk].revenue      += d.revenue;
    }
    series = Object.entries(byWeek).map(([date, d]) => ({
      date,
      cvr: d.sessions > 0 ? r2((d.transactions / d.sessions) * 100) : 0,
      aov: d.transactions > 0 ? r2(d.revenue / d.transactions) : 0,
      sessions: Math.round(d.sessions),
    })).sort((a, b) => a.date.localeCompare(b.date));
  }
  const dayEntries = Object.entries(byDay).map(([date, d]) => ({
    date, sessions: d.sessions, transactions: d.transactions, revenue: d.revenue,
  }));
  function w(arr, field) {
    const s = arr.reduce((a, d) => a + d.sessions, 0);
    if (!s) return 0;
    if (field === 'cvr') {
      const t = arr.reduce((a, d) => a + d.transactions, 0);
      return r2((t / s) * 100);
    }
    const r = arr.reduce((a, d) => a + d.revenue, 0);
    const t = arr.reduce((a, d) => a + d.transactions, 0);
    return t > 0 ? r2(r / t) : 0;
  }
  const cvrAvg = w(dayEntries, 'cvr');
  const aovAvg = w(dayEntries, 'aov');
  const today = new Date();
  const d14 = new Date(today); d14.setDate(today.getDate() - 14);
  const d28 = new Date(today); d28.setDate(today.getDate() - 28);
  const fmt = d => d.toISOString().slice(0, 10);
  const last14 = dayEntries.filter(d => d.date >= fmt(d14));
  const prev14 = dayEntries.filter(d => d.date >= fmt(d28) && d.date < fmt(d14));
  const cvrLast = w(last14, 'cvr'), cvrPrev = w(prev14, 'cvr');
  const aovLast = w(last14, 'aov'), aovPrev = w(prev14, 'aov');
  return {
    data: series,
    cvr: { avg: cvrAvg, trend: cvrLast > cvrPrev ? 'UP' : 'DOWN', delta_pct: cvrPrev > 0 ? r2(((cvrLast - cvrPrev) / cvrPrev) * 100) : 0 },
    aov: { avg: aovAvg, trend: aovLast > aovPrev ? 'UP' : 'DOWN', delta_pct: aovPrev > 0 ? r2(((aovLast - aovPrev) / aovPrev) * 100) : 0 },
  };
}

const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

function makeFunnelLabel(dateStr, gran) {
  if (gran === 'day') {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
  }
  const mon = new Date(dateStr + 'T00:00:00');
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.getDate()}-${sun.getDate()} ${MONTHS_FR[mon.getMonth()]}`;
  }
  return `${mon.getDate()} ${MONTHS_FR[mon.getMonth()]} - ${sun.getDate()} ${MONTHS_FR[sun.getMonth()]}`;
}

function makePeriodId(dateStr, gran) {
  if (gran === 'day') return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfW1 = new Date(jan4); startOfW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const wn = Math.round((d - startOfW1) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}

export async function getGA4FunnelYtd({ brand = 'ALL', market = 'ALL', granularity = 'week' } = {}) {
  const { byDay } = granularitySeries(brand, market, granularity, null);
  // Synthesize funnel events from daily totals.
  // view_item ≈ sessions * 0.55 (mostly product page views)
  // → add_to_cart 12% → begin_checkout 6% → add_shipping 4.5% →
  //   add_payment 3.5% → purchase 2.5%
  const periodMap = {};
  const grouper = (d) => granularity === 'day' ? d : granularityKey(d, 'week');
  for (const [date, d] of Object.entries(byDay)) {
    const key = grouper(date);
    if (!periodMap[key]) periodMap[key] = { add_to_cart: 0, begin_checkout: 0, add_shipping_info: 0, add_payment_info: 0, purchase: 0, _firstDate: date };
    if (date < periodMap[key]._firstDate) periodMap[key]._firstDate = date;
    const sessions = d.sessions;
    periodMap[key].add_to_cart       += sessions * 0.12;
    periodMap[key].begin_checkout    += sessions * 0.06;
    periodMap[key].add_shipping_info += sessions * 0.045;
    periodMap[key].add_payment_info  += sessions * 0.035;
    periodMap[key].purchase          += d.transactions;
  }
  return Object.entries(periodMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([key, steps]) => {
      const cart     = Math.round(steps.add_to_cart);
      const checkout = Math.round(steps.begin_checkout);
      const shipping = Math.round(steps.add_shipping_info);
      const payment  = Math.round(steps.add_payment_info);
      const purchase = Math.round(steps.purchase);
      const refDate  = granularity === 'day' ? key : steps._firstDate;
      return {
        period: makePeriodId(refDate, granularity),
        label:  makeFunnelLabel(refDate, granularity),
        steps:  { add_to_cart: cart, begin_checkout: checkout, add_shipping_info: shipping, add_payment_info: payment, purchase },
        completion_rates: {
          cart_to_checkout:     cart     > 0 ? r2((checkout / cart)     * 100) : 0,
          checkout_to_shipping: checkout > 0 ? r2((shipping / checkout) * 100) : 0,
          shipping_to_payment:  shipping > 0 ? r2((payment  / shipping) * 100) : 0,
          payment_to_purchase:  payment  > 0 ? r2((purchase / payment)  * 100) : 0,
          cart_to_purchase:     cart     > 0 ? r2((purchase / cart)     * 100) : 0,
        },
      };
    });
}

export async function getGA4Hostnames({ brand = 'BRAND_A', from, to } = {}) {
  const out = {};
  const brandKeys = brandKeysForFilter(brand);
  for (const bKey of brandKeys) {
    const bDef = findBrand(bKey);
    if (!bDef) continue;
    out[bKey] = bDef.markets.map(m => {
      const r = aggregateRange(bKey, m.code, from || '2024-01-01', to || '2024-12-31');
      const tld = m.code === 'UK' ? 'co.uk' : m.code.toLowerCase();
      return {
        hostname: `www.${bKey.toLowerCase().replace('_', '-')}.example.${tld}`,
        sessions: r.sessions,
      };
    }).sort((a, b) => b.sessions - a.sessions);
  }
  return out;
}

// ─── No-ops / stubs ────────────────────────────────────────

export function getGA4Streams() { return {}; }

export async function fetchAndWriteStreams() { return {}; }

export function clearGA4Cache() { /* no-op in demo */ }
