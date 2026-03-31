import express from 'express';
import { getGA4Kpis, getGA4Trend, getGA4Channels, fetchAndWriteStreams, getGA4Streams, getGA4Hostnames } from '../ga4Client.js';

const router = express.Router();

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function absChange(current, previous) {
  return Math.round((current - previous) * 100) / 100;
}

function getComparisonDates(from, to, compareTo) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  const diffDays = Math.round((toDate - fromDate) / (1000 * 60 * 60 * 24));

  if (compareTo === 'previous_year') {
    const compFrom = new Date(fromDate);
    compFrom.setFullYear(compFrom.getFullYear() - 1);
    const compTo = new Date(toDate);
    compTo.setFullYear(compTo.getFullYear() - 1);
    return { compFrom: fmtDate(compFrom), compTo: fmtDate(compTo) };
  }

  const compTo2 = new Date(fromDate);
  compTo2.setDate(compTo2.getDate() - 1);
  const compFrom2 = new Date(compTo2);
  compFrom2.setDate(compFrom2.getDate() - diffDays);
  return { compFrom: fmtDate(compFrom2), compTo: fmtDate(compTo2) };
}

function fmtDate(d) { return d.toISOString().slice(0, 10); }

// ─── Init streams on first request ─────────────────────
let streamsLoaded = false;
async function ensureStreams() {
  if (!streamsLoaded) {
    await fetchAndWriteStreams();
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
      newCustomers_pct: pctChange(current.newCustomers, previous.newCustomers),
      transactions_pct: pctChange(current.transactions, previous.transactions),
      revenue_pct: pctChange(current.revenue, previous.revenue),
      cvr_pct: pctChange(current.cvr, previous.cvr),
      aov_pct: pctChange(current.aov, previous.aov),
    };

    res.json({ current, previous, deltas });
  } catch (err) {
    console.error('GA4 KPI error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ga4/trend ─────────────────────────────────
router.get('/trend', async (req, res) => {
  try {
    await ensureStreams();
    const { brand = 'ALL', market = 'ALL', from, to, granularity = 'day', sourceMedium } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const series = await getGA4Trend({ brand, market, from, to, granularity, sourceMedium });
    res.json(series);
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

// ─── GET /api/ga4/streams — debug ──────────────────────
router.get('/streams', async (req, res) => {
  try {
    await ensureStreams();
    res.json(getGA4Streams());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/ga4/hostnames — debug (liste les vrais hostnames GA4) ──────────
router.get('/hostnames', async (req, res) => {
  try {
    const { brand = 'COCOONCENTER', from = '2026-03-01', to = '2026-03-31' } = req.query;
    const hostnames = await getGA4Hostnames({ brand, from, to });
    res.json(hostnames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
