import { Router } from 'express';
import { queryAccount, buildMetricsQuery, parseMetrics } from '../googleAds.js';
import { isAuthenticated } from '../auth.js';
import { getFilteredAccounts } from './kpis.js';

const router = Router();

router.get('/budget', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { brand = 'ALL', month } = req.query;
    if (!month) return res.status(400).json({ error: 'Missing month parameter (YYYY-MM)' });

    // Calculate month boundaries
    const [year, mon] = month.split('-').map(Number);
    const firstDay = new Date(year, mon - 1, 1);
    const lastDay = new Date(year, mon, 0); // last day of month
    const today = new Date();
    const endDate = today < lastDay ? today : lastDay;

    const from = fmt(firstDay);
    const to = fmt(endDate);

    const daysElapsed = Math.floor((endDate - firstDay) / (1000 * 60 * 60 * 24)) + 1;
    const daysTotal = lastDay.getDate();

    const accounts = getFilteredAccounts(brand, 'ALL');

    const allRows = [];
    await Promise.all(accounts.map(async (acc) => {
      const gaql = buildMetricsQuery('customer', from, to);
      const rows = await queryAccount(acc, gaql);
      allRows.push(...rows);
    }));

    const metrics = parseMetrics(allRows);
    const spendToDate = metrics.spend;

    // Projection: linear extrapolation
    const dailyAvg = daysElapsed > 0 ? spendToDate / daysElapsed : 0;
    const projectionBase = dailyAvg * daysTotal;
    const projectionOptimistic = projectionBase * 1.15;
    const projectionPessimistic = projectionBase * 0.85;

    res.json({
      spend_to_date: spendToDate,
      budget_monthly: null, // Set from frontend via localStorage
      days_elapsed: daysElapsed,
      days_total: daysTotal,
      pacing_pct: null, // Calculated on frontend with budget_monthly
      projection_base: projectionBase,
      projection_optimistic: projectionOptimistic,
      projection_pessimistic: projectionPessimistic,
    });
  } catch (err) {
    console.error('Budget error:', err);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

function fmt(d) {
  return d.toISOString().slice(0, 10);
}

export default router;
