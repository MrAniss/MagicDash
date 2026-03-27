import { Router } from 'express';
import { BRANDS } from '../config/accounts.js';
import { queryAccount, buildTrendQuery, parseTrendRows } from '../googleAds.js';
import { isAuthenticated } from '../auth.js';
import { getFilteredAccounts, getComparisonDates } from './kpis.js';

const router = Router();

router.get('/trend', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', granularity } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to date parameters' });

    const accounts = getFilteredAccounts(brand, market);
    if (accounts.length === 0) return res.json({ current: [], previous: [] });

    // Auto granularity: day if ≤ 90 days, week otherwise
    const diffDays = Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24));
    const gran = granularity || (diffDays <= 90 ? 'day' : 'week');

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);

    const [currentRows, previousRows] = await Promise.all([
      fetchTrendAllAccounts(accounts, from, to, gran),
      fetchTrendAllAccounts(accounts, compFrom, compTo, gran),
    ]);

    const current = parseTrendRows(currentRows);
    const previous = parseTrendRows(previousRows);

    res.json({ current, previous });
  } catch (err) {
    console.error('Trend error:', err);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

async function fetchTrendAllAccounts(accounts, from, to, granularity) {
  const allRows = [];
  await Promise.all(accounts.map(async (acc) => {
    const gaql = buildTrendQuery('customer', from, to, granularity);
    const rows = await queryAccount(acc, gaql);
    allRows.push(...rows);
  }));
  return allRows;
}

export default router;
