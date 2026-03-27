import { Router } from 'express';
import { BRANDS } from '../config/accounts.js';
import { queryAccount, buildMetricsQuery, parseMetrics } from '../googleAds.js';
import { isAuthenticated } from '../auth.js';
import { getComparisonDates } from './kpis.js';

const router = Router();

router.get('/markets', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { brand = 'ALL', from, to, compareTo = 'previous_period' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to date parameters' });

    const brands = brand === 'ALL' ? Object.values(BRANDS) : BRANDS[brand] ? [BRANDS[brand]] : [];
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);

    const marketResults = [];

    for (const b of brands) {
      await Promise.all(b.accounts.map(async (acc) => {
        const account = { ...acc, mode: b.mode };
        const gaql = buildMetricsQuery('customer', from, to);
        const compGaql = buildMetricsQuery('customer', compFrom, compTo);

        const [currentRows, prevRows] = await Promise.all([
          queryAccount(account, gaql),
          queryAccount(account, compGaql),
        ]);

        const current = parseMetrics(currentRows);
        const previous = parseMetrics(prevRows);

        marketResults.push({
          market: acc.market,
          label: acc.label,
          brand: b.name,
          spend: current.spend,
          revenue: current.revenue,
          roas: current.roas,
          conversions: current.conversions,
          cvr: current.cvr,
          delta_roas: current.roas - previous.roas,
          delta_spend: previous.spend > 0 ? ((current.spend - previous.spend) / previous.spend) * 100 : 0,
        });
      }));
    }

    res.json(marketResults);
  } catch (err) {
    console.error('Markets error:', err);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

export default router;
