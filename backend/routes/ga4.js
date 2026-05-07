import express from 'express';
import { getGA4Kpis, getGA4Trend, getGA4Channels, getGA4BounceRateYtd, getGA4CvrAovYtd, getGA4FunnelYtd } from '../ga4Client.js';
import { getComparisonDates, fmtDate, pctChange, r2 } from '../dateUtils.js';
import { BRANDS } from '../config/accounts.js';
import { getRows } from '../googleAdsClient.js';

const router = express.Router();

function absChange(current, previous) {
  return Math.round((current - previous) * 100) / 100;
}

// ─── Init streams on first request ─────────────────────
let streamsLoaded = false;
async function ensureStreams() {
  if (!streamsLoaded) {
    streamsLoaded = true;
  }
}

// ─── GET /api/ga4/kpis ─────────────────────────────────
router.get('/kpis', async (req, res) => {
  try {
    await ensureStreams();
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', sourceMedium } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const current = await getGA4Kpis({ brand, market, from, to, sourceMedium });
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const previous = await getGA4Kpis({ brand, market, from: compFrom, to: compTo, sourceMedium });

    const deltas = {
      sessions_pct: pctChange(current.sessions, previous.sessions),
      users_pct: pctChange(current.users, previous.users),
      revenue_pct: pctChange(current.revenue, previous.revenue),
      transactions_pct: pctChange(current.transactions, previous.transactions),
      cvr_pct: pctChange(current.cvr, previous.cvr),
      aov_pct: pctChange(current.aov, previous.aov),
      cvr_abs: absChange(current.cvr, previous.cvr),
    };

    res.json({ current, previous, deltas });
  } catch (err) {
    console.error('GA4 KPI error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ga4/trend ────────────────────────────────
router.get('/trend', async (req, res) => {
  try {
    await ensureStreams();
    const { brand = 'ALL', market = 'ALL', from, to, granularity, sourceMedium } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const days = Math.round((new Date(to) - new Date(from)) / 86400000) + 1;
    const gran = granularity || (days <= 90 ? 'day' : 'week');

    const trend = await getGA4Trend({ brand, market, from, to, granularity: gran, sourceMedium });
    res.json(trend);
  } catch (err) {
    console.error('GA4 Trend error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ga4/channels ──────────────────────────────
router.get('/channels', async (req, res) => {
  try {
    await ensureStreams();
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', sourceMedium } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const channels = await getGA4Channels({ brand, market, from, to, compFrom, compTo, sourceMedium });
    res.json(channels);
  } catch (err) {
    console.error('GA4 Channels error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ga4/bounce-rate-ytd ─────────────────────
router.get('/bounce-rate-ytd', async (req, res) => {
  try {
    await ensureStreams();
    const { brand = 'ALL', market = 'ALL', sourceMedium, granularity } = req.query;
    const data = await getGA4BounceRateYtd({ brand, market, sourceMedium, granularity });
    res.json(data);
  } catch (err) {
    console.error('GA4 Bounce YTD error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ga4/cvr-aov-ytd ──────────────────────────
router.get('/cvr-aov-ytd', async (req, res) => {
  try {
    await ensureStreams();
    const { brand = 'ALL', market = 'ALL', sourceMedium, granularity } = req.query;
    const data = await getGA4CvrAovYtd({ brand, market, sourceMedium, granularity });
    res.json(data);
  } catch (err) {
    console.error('GA4 CVR/AOV YTD error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ga4/funnel-ytd ──────────────────────────
router.get('/funnel-ytd', async (req, res) => {
  try {
    await ensureStreams();
    const { brand = 'ALL', market = 'ALL', granularity } = req.query;
    const data = await getGA4FunnelYtd({ brand, market, granularity });
    res.json(data);
  } catch (err) {
    console.error('GA4 Funnel YTD error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ga4/markets-summary ─────────────────────
router.get('/markets-summary', async (req, res) => {
  try {
    await ensureStreams();
    const { brand = 'ALL', from, to, compareTo = 'previous_period', sourceMedium } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const brands = brand === 'ALL' ? Object.values(BRANDS) : BRANDS[brand] ? [BRANDS[brand]] : [];
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);

    const results = [];

    // Helper to compute NC Rate
    const getNcRate = (d) => d.transactions > 0 ? (d.newCustomers / d.transactions) * 100 : 0;

    for (const b of brands) {
      const brandKey = b.name === 'Brand Alpha' ? 'BRAND_A'
                     : b.name === 'Brand Beta' ? 'BRAND_B'
                     : b.name === 'Brand Delta' ? 'BRAND_D'
                     : 'BRAND_C';

      // Fetch Ads spend for ROAS calculation (always needed if sourceMedium is google/cpc)
      const adsRows = await getRows({ brand: brandKey, from, to });
      const adsCompRows = await getRows({ brand: brandKey, from: compFrom, to: compTo });

      const adsByMarket = {};
      adsRows.forEach(r => adsByMarket[r.market] = (adsByMarket[r.market] || 0) + r.cost);
      const adsCompByMarket = {};
      adsCompRows.forEach(r => adsCompByMarket[r.market] = (adsCompByMarket[r.market] || 0) + r.cost);

      for (const acc of b.accounts) {
        const mkt = acc.market;
        
        // Fetch GA4 current & previous
        const [current, previous] = await Promise.all([
          getGA4Kpis({ brand: brandKey, market: mkt, from, to, sourceMedium }),
          getGA4Kpis({ brand: brandKey, market: mkt, from: compFrom, to: compTo, sourceMedium })
        ]);

        const curNcRate = getNcRate(current);
        const prevNcRate = getNcRate(previous);
        
        const curBounce = current.bounceRate ?? 0;
        const prevBounce = previous.bounceRate ?? 0;

        // ROAS logic
        const curSpend = adsByMarket[mkt] || 0;
        const prevSpend = adsCompByMarket[mkt] || 0;
        const curRoas = curSpend > 0 ? current.revenue / curSpend : 0;
        const prevRoas = prevSpend > 0 ? previous.revenue / prevSpend : 0;

        results.push({
          brand: b.name,
          market: mkt,
          label: acc.label,
          
          sessions: current.sessions,
          delta_sessions: pctChange(current.sessions, previous.sessions),
          
          transactions: current.transactions,
          delta_transactions: pctChange(current.transactions, previous.transactions),
          
          revenue: current.revenue,
          delta_revenue: pctChange(current.revenue, previous.revenue),
          
          cvr: current.cvr,
          delta_cvr: pctChange(current.cvr, previous.cvr),
          
          aov: current.aov,
          delta_aov: pctChange(current.aov, previous.aov),

          bounce_rate: curBounce,
          delta_bounce_rate: pctChange(curBounce, prevBounce),
          
          new_customer_pct: curNcRate,
          delta_new_customer_pct: pctChange(curNcRate, prevNcRate),
          
          roas: curRoas,
          delta_roas: pctChange(curRoas, prevRoas),
        });
      }
    }

    res.json(results);
  } catch (err) {
    console.error('GA4 Markets Summary error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
