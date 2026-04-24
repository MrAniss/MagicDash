import { Router } from 'express';
import { BRANDS } from '../config/accounts.js';
import { queryAccount, buildMetricsQuery, parseMetrics } from '../googleAds.js';
import { isAuthenticated } from '../auth.js';

const router = Router();

router.get('/kpis', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated. Please connect Google Ads first.' });

  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period' } = req.query;

    if (!from || !to) return res.status(400).json({ error: 'Missing from/to date parameters' });

    const accounts = getFilteredAccounts(brand, market);
    if (accounts.length === 0) return res.json({ current: emptyMetrics(), previous: emptyMetrics(), deltas: {} });

    // Calculate comparison period
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);

    // Fetch current & comparison in parallel
    const [currentRows, previousRows] = await Promise.all([
      fetchAllAccounts(accounts, from, to),
      fetchAllAccounts(accounts, compFrom, compTo),
    ]);

    const current = parseMetrics(currentRows);
    const previous = parseMetrics(previousRows);
    const deltas = computeDeltas(current, previous);

    res.json({ current, previous, deltas });
  } catch (err) {
    console.error('KPI error:', err);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

async function fetchAllAccounts(accounts, from, to) {
  const allRows = [];
  const queries = accounts.map(async (acc) => {
    const gaql = buildMetricsQuery('customer', from, to);
    const rows = await queryAccount(acc, gaql);
    allRows.push(...rows);
  });
  await Promise.all(queries);
  return allRows;
}

export function getFilteredAccounts(brand, market) {
  let accounts = [];
  const brands = brand === 'ALL' ? Object.values(BRANDS) : BRANDS[brand] ? [BRANDS[brand]] : [];

  for (const b of brands) {
    for (const acc of b.accounts) {
      if (market === 'ALL' || acc.market === market) {
        accounts.push({ ...acc, mode: b.mode });
      }
    }
  }
  return accounts;
}

export function getComparisonDates(from, to, compareTo) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffMs = toDate - fromDate;
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  if (compareTo === 'previous_year') {
    const compFrom = new Date(fromDate);
    compFrom.setFullYear(compFrom.getFullYear() - 1);
    const compTo = new Date(toDate);
    compTo.setFullYear(compTo.getFullYear() - 1);
    return { compFrom: fmt(compFrom), compTo: fmt(compTo) };
  }

  // previous_period
  const compTo = new Date(fromDate);
  compTo.setDate(compTo.getDate() - 1);
  const compFrom = new Date(compTo);
  compFrom.setDate(compFrom.getDate() - diffDays);
  return { compFrom: fmt(compFrom), compTo: fmt(compTo) };
}

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

function computeDeltas(current, previous) {
  return {
    spend_pct: pctChange(current.spend, previous.spend),
    revenue_pct: pctChange(current.revenue, previous.revenue),
    roas_pct: pctChange(current.roas, previous.roas),
    conversions_pct: pctChange(current.conversions, previous.conversions),
    cvr_pct: pctChange(current.cvr, previous.cvr),
    clicks_pct: pctChange(current.clicks, previous.clicks),
    impressions_pct: pctChange(current.impressions, previous.impressions),
    ctr_pct: pctChange(current.ctr, previous.ctr),
    aov_pct: pctChange(current.aov, previous.aov),
    cpc_pct: pctChange(current.cpc, previous.cpc),
  };
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

function emptyMetrics() {
  return { spend: 0, revenue: 0, roas: 0, conversions: 0, cvr: 0, clicks: 0, impressions: 0, ctr: 0, aov: 0, cpc: 0 };
}

export { getFilteredAccounts, getComparisonDates };
export default router;
