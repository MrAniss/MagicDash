import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import { authRouter, isAuthenticated } from './auth.js';
import { userAuthRouter, requireUser } from './userAuth.js';
import { getRows, clearCache, clearScoringCache } from './googleAdsClient.js';
import { generateRecommendations } from './services/recommendationEngine.js';
import { aggregateMetrics, groupBy } from './aggregation.js';
import { BRANDS } from './config/accounts.js';
import { getBudgetForMonth, getBrandBBudgetForMonth, clearBudgetCache } from './services/budgetSheetReader.js';
import { AUTRES_PAYS_MARKETS } from './config/budgetMarketMap.js';
import { clearGA4Cache, getGA4Rows, getGA4Kpis, getGA4ByCampaign } from './ga4Client.js';
import { clearMcCache } from './services/merchantCenterClient.js';
import { initCacheWarmer } from './services/cacheWarmer.js';
import ga4Router from './routes/ga4.js';
import recommendationsRouter from './routes/recommendations.js';
import shoppingRouter from './routes/shopping.js';
import reportsRouter from './routes/reports.js';
import paidSocialRouter from './routes/paidSocial.js';
import feedMonitorRouter from './routes/feedMonitor.js';
import setupRouter from './routes/setup.js';
import { initScheduler } from './services/scheduler.js';
import { clearMetaCache } from './metaAdsClient.js';

import { getComparisonDates, fmtDate, daysBetween, r2, pctChange, getISOWeek } from './dateUtils.js';

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_SOURCE = 'google-ads-api';

// CORS strategy:
//   • If `CORS_ALLOWED_ORIGINS` is set (comma-separated), it's strict whitelist.
//   • Otherwise we reflect the request Origin — safe for self-hosted setups
//     where the backend sits behind a reverse proxy (Nginx Proxy Manager,
//     Traefik, Caddy) and isn't directly reachable. The actual auth gate is
//     the JWT, not the Origin header.
const explicitAllowed = (process.env.CORS_ALLOWED_ORIGINS || process.env.FRONTEND_URL || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const baseAllowed = ['http://localhost:5173', 'http://localhost:3001', ...explicitAllowed];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (baseAllowed.includes(origin)) return cb(null, true);
    // No explicit whitelist → permissive (self-host default).
    if (explicitAllowed.length === 0) return cb(null, true);
    return cb(new Error(`Not allowed by CORS: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '100mb' }));

authRouter(app);
userAuthRouter(app);

// Setup wizard — must be mounted BEFORE any auth middleware because it runs
// on first launch (no users, no tokens). Stays public after bootstrap so the
// frontend can read /api/setup/status to know whether to show the wizard.
app.use('/api/setup', setupRouter);

// Toutes les routes /api/* et /auth/user-me exigent un JWT user valide.
// Les routes /auth/* de Google OAuth (login, callback, status, logout) restent ouvertes.
// TODO AUTH — décommenter pour activer la protection user (nécessite users.json rempli via scripts/addUser.js)
// app.use('/api', requireUser);

app.use('/api/ga4', ga4Router);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/paid-social', paidSocialRouter);
app.use('/api/feed-monitor', feedMonitorRouter);

app.get('/api/mode', (_req, res) => res.json({
  source: DATA_SOURCE,
  authenticated: isAuthenticated(),
}));

app.post('/api/cache/clear', (_req, res) => {
  clearCache();
  clearScoringCache();
  clearBudgetCache();
  clearGA4Cache();
  clearMcCache();
  clearMetaCache();
  ytdCache.clear();
  ga4YtdCache.clear();
  res.json({ ok: true });
});

// ─── GA4 reconciliation helpers ────────────────────────
// When dataSource === 'ga4', we keep Ads cost-side metrics (impressions,
// clicks, ctr, spend, cpc) and override conv-side metrics with GA4 figures
// filtered on `google / cpc` (i.e. SEA-attributed sessions in GA4).
const GA4_SEA_SOURCE_MEDIUM = 'google / cpc';

function applyGA4Conv(adsAgg, ga4Agg) {
  if (!ga4Agg) return adsAgg;
  const transactions = ga4Agg.transactions || 0;
  const revenue = ga4Agg.revenue || 0;
  const sessions = ga4Agg.sessions || 0;
  const spend = adsAgg.spend || 0;
  return {
    ...adsAgg,
    conversions: Math.round(transactions * 100) / 100,
    revenue: r2(revenue),
    cvr: sessions > 0 ? r2((transactions / sessions) * 100) : 0,
    aov: transactions > 0 ? r2(revenue / transactions) : 0,
    roas: spend > 0 ? r2(revenue / spend) : 0,
  };
}

function aggregateGA4RowList(rows) {
  let sessions = 0, transactions = 0, revenue = 0;
  for (const r of rows || []) {
    sessions += r.sessions || 0;
    transactions += r.transactions || 0;
    revenue += r.revenue || 0;
  }
  return { sessions, transactions, revenue };
}

// ─── KPIs ──────────────────────────────────────────────
app.get('/api/kpis', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', dataSource = 'ads' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const currentRows = await getRows({ brand, market, from, to });
    let current = aggregateMetrics(currentRows);

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, market, from: compFrom, to: compTo });
    let previous = aggregateMetrics(prevRows);

    if (dataSource === 'ga4') {
      const [ga4Cur, ga4Prev] = await Promise.all([
        getGA4Kpis({ brand, market, from, to, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
        getGA4Kpis({ brand, market, from: compFrom, to: compTo, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
      ]);
      current = applyGA4Conv(current, ga4Cur);
      previous = applyGA4Conv(previous, ga4Prev);
    }

    const deltas = {
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

    res.json({ current, previous, deltas, dataSource });
  } catch (err) {
    console.error('KPI error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Trend ─────────────────────────────────────────────
app.get('/api/trend', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', granularity } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const days = daysBetween(from, to);
    const gran = granularity || (days <= 90 ? 'day' : 'week');

    const currentRows = await getRows({ brand, market, from, to });
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, market, from: compFrom, to: compTo });

    const current = buildTrendSeries(currentRows, gran);
    const previous = buildTrendSeries(prevRows, gran);

    res.json({ current, previous });
  } catch (err) {
    console.error('Trend error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Markets ───────────────────────────────────────────
app.get('/api/markets', async (req, res) => {
  try {
    const { brand = 'ALL', from, to, compareTo = 'previous_period', dataSource = 'ads' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const currentRows = await getRows({ brand, from, to });
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, from: compFrom, to: compTo });

    const currentByMarket = groupBy(currentRows, r => `${r.brand}|${r.market}`);
    const prevByMarket = groupBy(prevRows, r => `${r.brand}|${r.market}`);

    // For GA4 mode: pre-fetch GA4 KPIs in parallel for each (brand,market) pair, both periods
    const ga4Map = { current: {}, previous: {} };
    if (dataSource === 'ga4') {
      const keys = Object.keys(currentByMarket);
      const fetchPair = async (key) => {
        const [brandKey, market] = key.split('|');
        const [cur, prev] = await Promise.all([
          getGA4Kpis({ brand: brandKey, market, from, to, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
          getGA4Kpis({ brand: brandKey, market, from: compFrom, to: compTo, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
        ]);
        ga4Map.current[key] = cur;
        ga4Map.previous[key] = prev;
      };
      await Promise.all(keys.map(fetchPair));
    }

    const results = [];
    for (const [key, rows] of Object.entries(currentByMarket)) {
      const [brandKey, market] = key.split('|');
      let cur = aggregateMetrics(rows);
      let prev = aggregateMetrics(prevByMarket[key] || []);

      if (dataSource === 'ga4') {
        cur = applyGA4Conv(cur, ga4Map.current[key]);
        prev = applyGA4Conv(prev, ga4Map.previous[key]);
      }

      const brandObj = BRANDS[brandKey];
      const acc = brandObj?.accounts.find(a => a.market === market);
      const firstRow = rows[0];

      results.push({
        market,
        label: acc?.label || market,
        brand: firstRow?.brandLabel || brandObj?.name || brandKey,
        spend: cur.spend,
        revenue: cur.revenue,
        roas: cur.roas,
        conversions: cur.conversions,
        cvr: cur.cvr,
        clicks: cur.clicks,
        impressions: cur.impressions,
        ctr: cur.ctr,
        aov: cur.aov,
        cpc: cur.cpc,
        delta_impressions:  pctChange(cur.impressions, prev.impressions),
        delta_clicks:       pctChange(cur.clicks, prev.clicks),
        delta_cpc:          pctChange(cur.cpc, prev.cpc),
        delta_ctr:          pctChange(cur.ctr, prev.ctr),
        delta_cvr:          pctChange(cur.cvr, prev.cvr),
        delta_spend:        pctChange(cur.spend, prev.spend),
        delta_revenue:      pctChange(cur.revenue, prev.revenue),
        delta_roas:         pctChange(cur.roas, prev.roas),
        delta_conversions:  pctChange(cur.conversions, prev.conversions),
        delta_aov:          pctChange(cur.aov, prev.aov),
      });
    }

    res.json(results);
  } catch (err) {
    console.error('Markets error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Campaigns ─────────────────────────────────────────
app.get('/api/campaigns', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', from, to, type = 'ALL', compareTo = 'previous_period', dataSource = 'ads' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const rows = await getRows({ brand, market, from, to, campaignType: type });

    // Also get comparison for type-level deltas
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, market, from: compFrom, to: compTo, campaignType: type });

    // Group by campaign name
    const byCampaign = groupBy(rows, r => r.campaign);
    const prevByCampaign = groupBy(prevRows, r => r.campaign);

    // GA4 reconciliation by campaign name (Phase 2)
    let ga4CurByName = {}, ga4PrevByName = {};
    if (dataSource === 'ga4') {
      const [g4Cur, g4Prev] = await Promise.all([
        getGA4ByCampaign({ brand, market, from, to, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
        getGA4ByCampaign({ brand, market, from: compFrom, to: compTo, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
      ]);
      for (const r of g4Cur)  ga4CurByName[r.campaignName]  = r;
      for (const r of g4Prev) ga4PrevByName[r.campaignName] = r;
    }

    const campaigns = Object.entries(byCampaign).map(([name, campRows]) => {
      let cur = aggregateMetrics(campRows);
      let prev = aggregateMetrics(prevByCampaign[name] || []);
      if (dataSource === 'ga4') {
        cur = applyGA4Conv(cur, ga4CurByName[name]);
        prev = applyGA4Conv(prev, ga4PrevByName[name]);
      }
      const firstRow = campRows[0];
      return {
        campaign_name: name,
        type: firstRow.campaign_type,
        status: firstRow.campaign_status === 'Active' ? 'ENABLED' : 'PAUSED',
        ...cur,
        delta_impressionShare: pctChange(cur.impressionShare, prev.impressionShare),
        delta_impressions: pctChange(cur.impressions, prev.impressions),
        delta_clicks: pctChange(cur.clicks, prev.clicks),
        delta_ctr: pctChange(cur.ctr, prev.ctr),
        delta_spend: pctChange(cur.spend, prev.spend),
        delta_cpc: pctChange(cur.cpc, prev.cpc),
        delta_conversions: pctChange(cur.conversions, prev.conversions),
        delta_revenue: pctChange(cur.revenue, prev.revenue),
        delta_cvr: pctChange(cur.cvr, prev.cvr),
        delta_aov: pctChange(cur.aov, prev.aov),
        delta_roas: pctChange(cur.roas, prev.roas),
        delta_rankLostShare: pctChange(cur.rankLostShare, prev.rankLostShare),
        delta_budgetLostShare: pctChange(cur.budgetLostShare, prev.budgetLostShare),
      };
    });

    // Type-level summary: when ga4, aggregate from already-merged campaigns
    // (sums across campaigns of the same type) so the per-type figures match
    // the table totals; otherwise use the raw Ads aggregation as before.
    const totalSpend = rows.reduce((s, r) => s + r.cost, 0);

    let typeSummary;
    if (dataSource === 'ga4') {
      const campaignByType = groupBy(campaigns, c => c.type);
      const curTypeRowsByType = groupBy(rows, r => r.campaign_type);
      const prevTypeRowsByType = groupBy(prevRows, r => r.campaign_type);
      const prevByCampaignKey = (n) => prevByCampaign[n] || [];
      typeSummary = Object.entries(campaignByType).map(([typeName, camps]) => {
        // Sum cost-side from Ads, conv-side from GA4 (i.e. from the already-merged campaign rows)
        const sum = (k) => camps.reduce((s, c) => s + (c[k] || 0), 0);
        const spend = sum('spend');
        const clicks = sum('clicks');
        const impressions = sum('impressions');
        const conversions = sum('conversions');
        const revenue = sum('revenue');

        // Reconstruct previous from merged: aggregate prev Ads + prev GA4 per campaign
        const prevAgg = camps.reduce((acc, c) => {
          const prevAds = aggregateMetrics(prevByCampaignKey(c.campaign_name));
          const prevMerged = applyGA4Conv(prevAds, ga4PrevByName[c.campaign_name]);
          acc.spend += prevMerged.spend || 0;
          acc.revenue += prevMerged.revenue || 0;
          acc.conversions += prevMerged.conversions || 0;
          acc.clicks += prevMerged.clicks || 0;
          acc.impressions += prevMerged.impressions || 0;
          acc._sessions += (ga4PrevByName[c.campaign_name]?.sessions || 0);
          return acc;
        }, { spend: 0, revenue: 0, conversions: 0, clicks: 0, impressions: 0, _sessions: 0 });

        const totalSessions = camps.reduce((s, c) => s + (ga4CurByName[c.campaign_name]?.sessions || 0), 0);
        const cvr = totalSessions > 0 ? (conversions / totalSessions) * 100 : 0;
        const aov = conversions > 0 ? revenue / conversions : 0;
        const roas = spend > 0 ? revenue / spend : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;

        const prevCvr = prevAgg._sessions > 0 ? (prevAgg.conversions / prevAgg._sessions) * 100 : 0;
        const prevAov = prevAgg.conversions > 0 ? prevAgg.revenue / prevAgg.conversions : 0;
        const prevRoas = prevAgg.spend > 0 ? prevAgg.revenue / prevAgg.spend : 0;
        const prevCpc = prevAgg.clicks > 0 ? prevAgg.spend / prevAgg.clicks : 0;
        const prevCtr = prevAgg.impressions > 0 ? (prevAgg.clicks / prevAgg.impressions) * 100 : 0;

        // Impression share is cost-side (from Ads), not affected by GA4
        const adsCurAgg  = aggregateMetrics(curTypeRowsByType[typeName] || []);
        const adsPrevAgg = aggregateMetrics(prevTypeRowsByType[typeName] || []);

        return {
          type: typeName,
          impressions,
          clicks,
          ctr: r2(ctr),
          spend: r2(spend),
          spend_pct: totalSpend > 0 ? Math.round((spend / totalSpend) * 10000) / 100 : 0,
          cpc: r2(cpc),
          conversions: Math.round(conversions * 100) / 100,
          revenue: r2(revenue),
          cvr: r2(cvr),
          aov: r2(aov),
          roas: r2(roas),
          delta_impressions: pctChange(impressions, prevAgg.impressions),
          delta_clicks: pctChange(clicks, prevAgg.clicks),
          delta_ctr: pctChange(ctr, prevCtr),
          delta_spend: pctChange(spend, prevAgg.spend),
          delta_cpc: pctChange(cpc, prevCpc),
          delta_conversions: pctChange(conversions, prevAgg.conversions),
          delta_revenue: pctChange(revenue, prevAgg.revenue),
          delta_cvr: pctChange(cvr, prevCvr),
          delta_aov: pctChange(aov, prevAov),
          delta_roas: pctChange(roas, prevRoas),
          delta_impressionShare: pctChange(adsCurAgg.impressionShare, adsPrevAgg.impressionShare),
        };
      });
    } else {
      const byType = groupBy(rows, r => r.campaign_type);
      const prevByType = groupBy(prevRows, r => r.campaign_type);
      typeSummary = Object.entries(byType).map(([typeName, typeRows]) => {
        const cur = aggregateMetrics(typeRows);
        const prev = aggregateMetrics(prevByType[typeName] || []);
        return {
          type: typeName,
          impressions: cur.impressions,
          clicks: cur.clicks,
          ctr: cur.ctr,
          spend: cur.spend,
          spend_pct: totalSpend > 0 ? Math.round((cur.spend / totalSpend) * 10000) / 100 : 0,
          cpc: cur.cpc,
          conversions: cur.conversions,
          revenue: cur.revenue,
          cvr: cur.cvr,
          aov: cur.aov,
          roas: cur.roas,
          delta_impressions: pctChange(cur.impressions, prev.impressions),
          delta_clicks: pctChange(cur.clicks, prev.clicks),
          delta_ctr: pctChange(cur.ctr, prev.ctr),
          delta_spend: pctChange(cur.spend, prev.spend),
          delta_cpc: pctChange(cur.cpc, prev.cpc),
          delta_conversions: pctChange(cur.conversions, prev.conversions),
          delta_revenue: pctChange(cur.revenue, prev.revenue),
          delta_cvr: pctChange(cur.cvr, prev.cvr),
          delta_aov: pctChange(cur.aov, prev.aov),
          delta_roas: pctChange(cur.roas, prev.roas),
          delta_impressionShare: pctChange(cur.impressionShare, prev.impressionShare),
        };
      });
    }

    campaigns.sort((a, b) => b.spend - a.spend);
    typeSummary.sort((a, b) => b.spend - a.spend);

    res.json({ campaigns, typeSummary, dataSource });
  } catch (err) {
    console.error('Campaigns error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Granularity ───────────────────────────────────────
app.get('/api/granularity', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', granularity = 'day', dataSource = 'ads' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const currentRows = await getRows({ brand, market, from, to });
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, market, from: compFrom, to: compTo });

    const currentSeries = buildTrendSeries(currentRows, granularity);
    const prevSeries = buildTrendSeries(prevRows, granularity);

    // GA4 mode: group GA4 daily rows by same granularity and override conv-side metrics per period
    const granKeyFn = (dateStr) => {
      if (granularity === 'month') return dateStr.slice(0, 7);
      if (granularity === 'week') {
        const d = new Date(dateStr);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d);
        monday.setDate(diff);
        return fmtDate(monday);
      }
      return dateStr;
    };
    let curGA4Map = {}, prevGA4Map = {};
    if (dataSource === 'ga4') {
      const [g4Cur, g4Prev] = await Promise.all([
        getGA4Rows({ brand, market, from, to, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
        getGA4Rows({ brand, market, from: compFrom, to: compTo, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
      ]);
      const groupGA4 = (rows) => {
        const acc = {};
        for (const r of rows) {
          const k = granKeyFn(r.date);
          if (!acc[k]) acc[k] = { sessions: 0, transactions: 0, revenue: 0 };
          acc[k].sessions += r.sessions || 0;
          acc[k].transactions += r.transactions || 0;
          acc[k].revenue += r.revenue || 0;
        }
        return acc;
      };
      curGA4Map = groupGA4(g4Cur);
      prevGA4Map = groupGA4(g4Prev);
      currentSeries.forEach((item, i) => {
        const merged = applyGA4Conv(item, curGA4Map[item.date]);
        currentSeries[i] = { ...item, ...merged };
      });
      prevSeries.forEach((item, i) => {
        const merged = applyGA4Conv(item, prevGA4Map[item.date]);
        prevSeries[i] = { ...item, ...merged };
      });
    }

    // Build a map of previous period data by index
    const result = currentSeries.map((item, i) => {
      const prev = prevSeries[i] || { spend: 0, revenue: 0, roas: 0, conversions: 0, cvr: 0, clicks: 0, impressions: 0, ctr: 0, aov: 0 };
      return {
        period: item.date,
        impressions: item.impressions,
        delta_impressions: pctChange(item.impressions, prev.impressions),
        clicks: item.clicks,
        delta_clicks: pctChange(item.clicks, prev.clicks),
        cpc: item.cpc,
        delta_cpc: pctChange(item.cpc, prev.cpc),
        ctr: item.ctr,
        delta_ctr: pctChange(item.ctr, prev.ctr),
        cvr: item.cvr,
        delta_cvr: pctChange(item.cvr, prev.cvr),
        spend: item.spend,
        delta_spend: pctChange(item.spend, prev.spend),
        revenue: item.revenue,
        delta_revenue: pctChange(item.revenue, prev.revenue),
        roas: item.roas,
        delta_roas: pctChange(item.roas, prev.roas),
        conversions: item.conversions,
        delta_conversions: pctChange(item.conversions, prev.conversions),
        aov: item.aov,
        delta_aov: pctChange(item.aov, prev.aov),
      };
    });

    // Reverse for anti-chronological order
    result.reverse();

    res.json(result);
  } catch (err) {
    console.error('Granularity error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Budget (Sheet budget + Google Ads spend + forecast) ──
app.get('/api/budget', async (req, res) => {
  try {
    const { brand = 'Brand Alpha', market = 'ALL', month, compareTo = 'previous_month' } = req.query;
    if (!month) return res.status(400).json({ error: 'Missing month' });

    // Map brand param
    const brandLabel = brand === 'BRAND_C' || brand === 'Brand Gamma' ? 'Brand Gamma'
                     : brand === 'BRAND_B' || brand === 'Brand Beta' ? 'Brand Beta'
                     : brand === 'BRAND_D' || brand === 'Brand Delta' ? 'Brand Delta'
                     : 'Brand Alpha';

    const adsBrandKey = brandLabel === 'Brand Alpha' ? 'BRAND_A'
                      : brandLabel === 'Brand Gamma' ? 'BRAND_C'
                      : brandLabel === 'Brand Delta' ? 'BRAND_D'
                      : 'BRAND_B';

    const isBrandB = adsBrandKey === 'BRAND_B';

    // Get budgets from Sheet
    let brandBudgets = {};
    if (isBrandB) {
      const brandBBudgets = await getBrandBBudgetForMonth(month);
      brandBudgets = brandBBudgets[brandLabel] || {};
    } else {
      const budgets = await getBudgetForMonth(month);
      brandBudgets = budgets[brandLabel] || {};
    }

    // Date range for current month spend
    const [year, mon] = month.split('-').map(Number);
    const firstDay = new Date(year, mon - 1, 1);
    const lastDay = new Date(year, mon, 0);
    const today = new Date();
    const endDate = today < lastDay ? today : lastDay;
    const from = fmtDate(firstDay);
    const to = fmtDate(endDate);
    const daysElapsed = Math.floor((endDate - firstDay) / (1000 * 60 * 60 * 24)) + 1;
    const daysTotal = lastDay.getDate();

    // Comparison period (full month)
    let compFrom, compTo;
    if (compareTo === 'previous_year') {
      compFrom = fmtDate(new Date(year - 1, mon - 1, 1));
      compTo = fmtDate(new Date(year - 1, mon, 0));
    } else {
      // previous_month
      compFrom = fmtDate(new Date(year, mon - 2, 1));
      compTo = fmtDate(new Date(year, mon - 1, 0));
    }

    // Fetch current + comparison rows in parallel
    const marketFilter = market !== 'ALL' && market !== 'Autres pays' ? market : undefined;

    const [currentRows, compRows] = await Promise.all([
      getRows({ brand: adsBrandKey, market: marketFilter, from, to }),
      getRows({ brand: adsBrandKey, market: marketFilter, from: compFrom, to: compTo }),
    ]);

    // Aggregate helper for a market filter on rows
    function aggregateForMarket(rows, mkt) {
      let filtered = rows;
      if (mkt && mkt !== 'ALL') {
        if (mkt === 'Autres pays') {
          filtered = rows.filter(r => AUTRES_PAYS_MARKETS.includes(r.market));
        } else {
          filtered = rows.filter(r => r.market === mkt);
        }
      }
      return aggregateMetrics(filtered);
    }

    const cur  = aggregateForMarket(currentRows, market);
    const comp = aggregateForMarket(compRows,    market);

    // Projections
    function buildMetricForecast(toDate, daysEl, daysT, compValue) {
      const dailyAvg = daysEl > 0 ? toDate / daysEl : 0;
      const projBase = r2(dailyAvg * daysT);
      const projOpt = r2(projBase * 1.15);
      const projPess = r2(projBase * 0.85);
      const compareDelta = compValue > 0 ? r2(((projBase - compValue) / compValue) * 100) : 0;
      return { to_date: r2(toDate), proj_base: projBase, proj_opt: projOpt, proj_pess: projPess, compare: r2(compValue), compare_delta: compareDelta };
    }

    const costForecast = buildMetricForecast(cur.spend, daysElapsed, daysTotal, comp.spend);
    const revForecast = buildMetricForecast(cur.revenue, daysElapsed, daysTotal, comp.revenue);
    const convForecast = buildMetricForecast(cur.conversions, daysElapsed, daysTotal, comp.conversions);

    // ROAS & AOV — derived from projections
    const roasProjBase = costForecast.proj_base > 0 ? r2(revForecast.proj_base / costForecast.proj_base) : 0;
    const roasCompare = comp.spend > 0 ? r2(comp.revenue / comp.spend) : 0;
    const roasDelta = roasCompare > 0 ? r2(((roasProjBase - roasCompare) / roasCompare) * 100) : 0;

    const aovProjBase = convForecast.proj_base > 0 ? r2(revForecast.proj_base / convForecast.proj_base) : 0;
    const aovCompare = comp.conversions > 0 ? r2(comp.revenue / comp.conversions) : 0;
    const aovDelta = aovCompare > 0 ? r2(((aovProjBase - aovCompare) / aovCompare) * 100) : 0;

    // Budget pacing (cost)
    const budgetValue = market === 'Autres pays' ? (brandBudgets['Autres pays'] || 0)
                   : market !== 'ALL' ? (brandBudgets[market] || 0)
                   : Object.values(brandBudgets).reduce((s, v) => s + v, 0);

    const theoreticalSpend = budgetValue > 0 ? (budgetValue / daysTotal) * daysElapsed : 0;
    const pacingPct = theoreticalSpend > 0 ? r2((cur.spend / theoreticalSpend) * 100) : 0;

    let costStatus = 'on_track';
    if (pacingPct > 105) costStatus = 'over';
    else if (pacingPct < 85) costStatus = 'under';

    // Per-market table (only for ALL markets view)
    let marketsTable = [];
    if (market === 'ALL') {
      const spendByMarket = {};
      for (const row of currentRows) {
        const mkt = row.market || 'OTHER';
        spendByMarket[mkt] = (spendByMarket[mkt] || 0) + row.cost;
      }

      const allMarketKeys = new Set([...Object.keys(brandBudgets), ...Object.keys(spendByMarket)]);
      for (const mkt of allMarketKeys) {
        if (AUTRES_PAYS_MARKETS.includes(mkt) && brandBudgets['Autres pays'] !== undefined) continue;

        const mktBudget = brandBudgets[mkt] || 0;
        let mktSpend = mkt === 'Autres pays'
          ? AUTRES_PAYS_MARKETS.reduce((s, m) => s + (spendByMarket[m] || 0), 0)
          : (spendByMarket[mkt] || 0);
        mktSpend = r2(mktSpend);

        if (mktBudget === 0 && mktSpend === 0) continue;

        const mktDailyAvg = daysElapsed > 0 ? mktSpend / daysElapsed : 0;
        const mktProjBase = r2(mktDailyAvg * daysTotal);
        const mktTheoretical = mktBudget > 0 ? (mktBudget / daysTotal) * daysElapsed : 0;
        const mktPacing = mktTheoretical > 0 ? r2((mktSpend / mktTheoretical) * 100) : 0;

        let mktStatus = 'on_track';
        if (mktPacing > 105) mktStatus = 'over';
        else if (mktPacing < 85) mktStatus = 'under';

        const mktRemaining = mktBudget - mktSpend;
        const mktRemDays = daysTotal - daysElapsed;
        const mktDailyTarget = mktRemaining > 0 && mktRemDays > 0 ? r2(mktRemaining / mktRemDays) : 0;
        const mktDailyActual = daysElapsed > 0 ? r2(mktSpend / daysElapsed) : 0;

        marketsTable.push({
          market: mkt, budget: mktBudget, spend_to_date: mktSpend,
          pacing_pct: mktPacing,
          projection_base: mktProjBase,
          projection_optimistic: r2(mktProjBase * 1.15),
          projection_pessimistic: r2(mktProjBase * 0.85),
          status: mktStatus,
          daily_actual: mktDailyActual,
          daily_target: mktDailyTarget,
          daily_delta: r2(mktDailyActual - mktDailyTarget),
        });
      }
      marketsTable.sort((a, b) => b.spend_to_date - a.spend_to_date);
    }

    res.json({
      month, brand: brandLabel, market,
      days_elapsed: daysElapsed,
      days_total: daysTotal,
      budget: budgetValue || null,
      cost: {
        ...costForecast,
        budget: budgetValue || null,
        pacing_pct: pacingPct,
        status: costStatus,
      },
      revenue: revForecast,
      roas: {
        to_date: r2(cur.roas),
        proj_base: roasProjBase,
        compare: roasCompare,
        compare_delta: roasDelta,
      },
      conversions: convForecast,
      aov: {
        to_date: r2(cur.aov),
        proj_base: aovProjBase,
        compare: aovCompare,
        compare_delta: aovDelta,
      },
      markets: marketsTable,
      daily_actual: daysElapsed > 0 ? r2(cur.spend / daysElapsed) : 0,
      daily_target: (() => {
        const remaining = budgetValue - cur.spend;
        const remDays = daysTotal - daysElapsed;
        return remaining > 0 && remDays > 0 ? r2(remaining / remDays) : 0;
      })(),
      daily_delta: (() => {
        const dailyActual = daysElapsed > 0 ? cur.spend / daysElapsed : 0;
        const remaining = budgetValue - cur.spend;
        const remDays = daysTotal - daysElapsed;
        const dailyTarget = remaining > 0 && remDays > 0 ? remaining / remDays : 0;
        return r2(dailyActual - dailyTarget);
      })(),
    });
  } catch (err) {
    console.error('Budget error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Budget Recommendations ────────────────────────────
app.get('/api/budget/recommendations', async (req, res) => {
  try {
    const { brand = 'Brand Alpha', month, granularity = 'market' } = req.query;
    if (!month) return res.status(400).json({ error: 'Missing month' });

    const brandLabel = brand === 'BRAND_C' || brand === 'Brand Gamma' ? 'Brand Gamma'
                     : brand === 'BRAND_B' || brand === 'Brand Beta' ? 'Brand Beta'
                     : brand === 'BRAND_D' || brand === 'Brand Delta' ? 'Brand Delta'
                     : 'Brand Alpha';
    const adsBrandKey = brandLabel === 'Brand Alpha' ? 'BRAND_A'
                      : brandLabel === 'Brand Gamma' ? 'BRAND_C'
                      : brandLabel === 'Brand Delta' ? 'BRAND_D'
                      : 'BRAND_B';

    // Get pacing data for all markets (needed for budget/projection signals)
    const isBrandB = adsBrandKey === 'BRAND_B';
    const budgets = isBrandB
      ? await getBrandBBudgetForMonth(month)
      : await getBudgetForMonth(month);
    const brandBudgets = (budgets[brandLabel] || {});

    const [year, mon] = month.split('-').map(Number);
    const firstDay = new Date(year, mon - 1, 1);
    const lastDay = new Date(year, mon, 0);
    const today = new Date();
    const endDate = today < lastDay ? today : lastDay;
    const from = endDate.toISOString().slice(0, 10);
    const daysElapsed = Math.floor((endDate - firstDay) / (1000 * 60 * 60 * 24)) + 1;
    const daysTotal = lastDay.getDate();

    const fromStr = firstDay.toISOString().slice(0, 10);

    const [rows] = await Promise.all([
      getRows({ brand: adsBrandKey, from: fromStr, to: from }),
    ]);

    const spendByMarket = {};
    for (const r of rows) { spendByMarket[r.market] = (spendByMarket[r.market] || 0) + r.cost; }

    // Build pacing market entries (same logic as /api/budget)
    const allMarkets = Object.keys({ ...brandBudgets, ...spendByMarket });
    const pacingMarkets = [];
    for (const mkt of allMarkets) {
      const mktBudget = brandBudgets[mkt] || 0;
      const mktSpend = r2(spendByMarket[mkt] || 0);
      if (mktBudget === 0 && mktSpend === 0) continue;
      const dailyAvg = daysElapsed > 0 ? mktSpend / daysElapsed : 0;
      const projBase = r2(dailyAvg * daysTotal);
      const theoretical = mktBudget > 0 ? (mktBudget / daysTotal) * daysElapsed : 0;
      const pacingPct = theoretical > 0 ? r2((mktSpend / theoretical) * 100) : 100;
      const remaining = mktBudget - mktSpend;
      const remDays = daysTotal - daysElapsed;
      pacingMarkets.push({
        market: mkt,
        budget: mktBudget,
        spend_to_date: mktSpend,
        pacing_pct: pacingPct,
        projection_base: projBase,
        daily_actual: daysElapsed > 0 ? r2(mktSpend / daysElapsed) : 0,
        daily_target: remaining > 0 && remDays > 0 ? r2(remaining / remDays) : 0,
      });
    }

    const recommendations = await generateRecommendations({
      brand: adsBrandKey,
      month,
      granularity,
      pacingMarkets,
      daysElapsed,
      daysTotal,
    });

    res.json(recommendations);
  } catch (err) {
    console.error('Recommendations error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ───────────────────────────────────────────

function buildTrendSeries(rows, granularity) {
  let keyFn;
  if (granularity === 'week') {
    keyFn = r => {
      const d = new Date(r.date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const monday = new Date(d);
      monday.setDate(diff);
      return fmtDate(monday);
    };
  } else if (granularity === 'month') {
    keyFn = r => r.date.slice(0, 7);
  } else {
    keyFn = r => r.date;
  }

  const grouped = groupBy(rows, keyFn);
  return Object.entries(grouped)
    .map(([date, dateRows]) => ({ date, ...aggregateMetrics(dateRows) }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Trend YTD ─────────────────────────────────────────
const ytdCache = new Map();
const YTD_CACHE_TTL = 60 * 60 * 1000; // 1h

app.get('/api/trend/ytd', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', granularity = 'week', dataSource = 'ads' } = req.query;

    const cacheKey = `ytd|${brand}|${market}|${granularity}|${dataSource}`;

    const cached = ytdCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < YTD_CACHE_TTL) {
      return res.json(cached.data);
    }

    const today = new Date();
    const from = `${today.getFullYear()}-01-01`;
    const to = fmtDate(today);

    const rows = await getRows({ brand, market, from, to });

    const series = buildTrendSeries(rows, granularity);

    // GA4 mode: fetch GA4 daily rows YTD and group by same granularity to override conv-side metrics
    let ga4Map = {};
    if (dataSource === 'ga4') {
      const g4Rows = await getGA4Rows({ brand, market, from, to, sourceMedium: GA4_SEA_SOURCE_MEDIUM });
      const granKeyFn = (dateStr) => {
        if (granularity === 'month') return dateStr.slice(0, 7);
        if (granularity === 'week') {
          const d = new Date(dateStr);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(d);
          monday.setDate(diff);
          return fmtDate(monday);
        }
        return dateStr;
      };
      for (const r of g4Rows) {
        const k = granKeyFn(r.date);
        if (!ga4Map[k]) ga4Map[k] = { sessions: 0, transactions: 0, revenue: 0 };
        ga4Map[k].sessions += r.sessions || 0;
        ga4Map[k].transactions += r.transactions || 0;
        ga4Map[k].revenue += r.revenue || 0;
      }
    }

    const FR_MONTHS = ['jan', 'fév', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

    const result = series.map(item => {
      const d = new Date(item.date);
      let period = item.date;
      let label = item.date;

      if (granularity === 'week') {
        const weekNum = getISOWeek(d);
        period = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
        const end = new Date(d);
        end.setDate(d.getDate() + 6);
        label = `W${String(weekNum).padStart(2, '0')} (${d.getDate()} ${FR_MONTHS[d.getMonth()]} – ${end.getDate()} ${FR_MONTHS[end.getMonth()]})`;
      } else if (granularity === 'month') {
        period = item.date.slice(0, 7);
        label = `${FR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      } else {
        label = `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
      }

      const merged = dataSource === 'ga4' ? applyGA4Conv(item, ga4Map[item.date]) : item;

      return {
        period,
        label,
        cost:        r2(merged.spend),
        clicks:      merged.clicks,
        impressions: merged.impressions,
        conversions: r2(merged.conversions),
        revenue:     r2(merged.revenue),
        roas:        r2(merged.roas),
        cpc:         r2(merged.cpc),
        cvr:         r2(merged.cvr),
        ctr:         r2(merged.ctr),
        aov:         r2(merged.aov),
      };
    });

    ytdCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    console.error('Trend YTD error:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── Budget Daily Spend YTD ────────────────────────────
const dailySpendCache = new Map();
const DAILY_CACHE_TTL = 60 * 60 * 1000; // 1h

app.get('/api/budget/daily-spend', async (req, res) => {
  try {
    const { brand = 'Brand Alpha', market = 'ALL', year } = req.query;
    const targetYear = parseInt(year || new Date().getFullYear(), 10);
    const cacheKey = `daily-spend|${brand}|${market}|${targetYear}`;

    const cached = dailySpendCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < DAILY_CACHE_TTL) {
      return res.json(cached.data);
    }

    const today = new Date();
    const from = `${targetYear}-01-01`;
    const to = today.getFullYear() === targetYear ? fmtDate(today) : `${targetYear}-12-31`;

    const brandLabel = brand === 'BRAND_C' ? 'Brand Gamma'
                     : brand === 'BRAND_A' ? 'Brand Alpha'
                     : brand === 'BRAND_B' ? 'Brand Beta'
                     : brand === 'BRAND_D' ? 'Brand Delta'
                     : brand;
    const adsBrandKey = brandLabel === 'Brand Alpha' ? 'BRAND_A'
                      : brandLabel === 'Brand Gamma' ? 'BRAND_C'
                      : brandLabel === 'Brand Delta' ? 'BRAND_D'
                      : 'BRAND_B';
    const isBrandB = adsBrandKey === 'BRAND_B';

    const isBrandA = adsBrandKey === 'BRAND_A';
    const isParaLafMarket = market === 'France Para Laf';
    const marketFilter = (market && market !== 'ALL' && !isParaLafMarket) ? market : undefined;

    // Fetch Brand A rows + Brand C rows in parallel when Brand A
    const [rows, paraLafRows] = await Promise.all([
      isParaLafMarket
        ? Promise.resolve([])
        : getRows({ brand: adsBrandKey, market: marketFilter, from, to }),
      (isBrandA && (market === 'ALL' || isParaLafMarket))
        ? getRows({ brand: 'BRAND_C', from, to })
        : Promise.resolve([]),
    ]);

    // Group spend by date + market
    const spendMap = {};
    for (const row of rows) {
      const key = `${row.date}|${row.market}`;
      spendMap[key] = (spendMap[key] || 0) + row.cost;
    }
    // Inject Para Laf as virtual market "France Para Laf"
    for (const row of paraLafRows) {
      const key = `${row.date}|France Para Laf`;
      spendMap[key] = (spendMap[key] || 0) + row.cost;
    }

    // Fetch monthly budgets in parallel for each month in range
    const endMonth = today.getFullYear() === targetYear ? today.getMonth() + 1 : 12;
    const months = Array.from({ length: endMonth }, (_, i) =>
      `${targetYear}-${String(i + 1).padStart(2, '0')}`
    );
    const budgetsByMonth = {};
    const paraLafBudgetsByMonth = {};
    await Promise.all(months.map(async m => {
      const budgets = isBrandB ? await getBrandBBudgetForMonth(m) : await getBudgetForMonth(m);
      budgetsByMonth[m] = budgets[brandLabel] || {};
      if (isBrandA) paraLafBudgetsByMonth[m] = budgets['Brand Gamma'] || {};
    }));

    // Build result array
    const result = [];
    const dates = [...new Set(Object.keys(spendMap).map(k => k.split('|')[0]))].sort();

    for (const date of dates) {
      const monthKey = date.slice(0, 7);
      const daysInMonth = new Date(parseInt(date.slice(0, 4)), parseInt(date.slice(5, 7)), 0).getDate();
      const monthBudgets = budgetsByMonth[monthKey] || {};
      const paraLafMonthBudgets = paraLafBudgetsByMonth[monthKey] || {};

      const marketsOnDate = new Set(
        Object.keys(spendMap).filter(k => k.startsWith(date + '|')).map(k => k.split('|')[1])
      );

      for (const mkt of marketsOnDate) {
        const spend = r2(spendMap[`${date}|${mkt}`] || 0);
        let mktBudget = 0;
        if (mkt === 'France Para Laf') {
          mktBudget = paraLafMonthBudgets['FR'] || 0;
        } else {
          mktBudget = monthBudgets[mkt] || 0;
        }
        const dailyTarget = mktBudget > 0 ? r2(mktBudget / daysInMonth) : 0;
        result.push({ date, market: mkt, brand: brandLabel, spend, budget_daily_target: dailyTarget });
      }
    }

    dailySpendCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    console.error('Daily spend error:', err);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GA4 Trend YTD ─────────────────────────────────────
const ga4YtdCache = new Map();
const GA4_YTD_CACHE_TTL = 60 * 60 * 1000; // 1h

app.get('/api/ga4/trend/ytd', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', granularity = 'week', sourceMedium } = req.query;
    const cacheKey = `ga4_ytd|${brand}|${market}|${granularity}|${sourceMedium || 'all'}`;

    const cached = ga4YtdCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < GA4_YTD_CACHE_TTL) {
      return res.json(cached.data);
    }

    const today = new Date();
    const from = `${today.getFullYear()}-01-01`;
    const to = fmtDate(today);

    // 1. Get GA4 Data
    const ga4Rows = await getGA4Rows({ brand, market, from, to, sourceMedium });
    
    // 2. Get Ads Data for Cost (spend)
    const adsRows = await getRows({ brand, market, from, to });

    // Helper to group and merge
    function buildMergedTrend(g4Rows, aRows, gran) {
      const g4ByDate = groupBy(g4Rows, r => r.date);
      const aByDate = groupBy(aRows, r => r.date);
      
      const allDates = [...new Set([...Object.keys(g4ByDate), ...Object.keys(aByDate)])].sort();
      
      const dailyMerged = allDates.map(date => {
        const g4 = aggregateGA4Metrics(g4ByDate[date] || []);
        const ads = aggregateMetrics(aByDate[date] || []);
        return {
          date,
          revenue: g4.revenue,
          sessions: g4.sessions,
          users: g4.users,
          transactions: g4.transactions,
          newCustomers: g4.newCustomers,
          cvr: g4.cvr,
          aov: g4.aov,
          bounceRate: g4.bounceRate,
          cost: ads.spend, // Ads spend
        };
      });

      // Group by granularity
      let keyFn;
      if (gran === 'week') {
        keyFn = r => {
          const d = new Date(r.date);
          const day = d.getDay();
          const diff = d.getDate() - day + (day === 0 ? -6 : 1);
          const monday = new Date(d);
          monday.setDate(diff);
          return fmtDate(monday);
        };
      } else if (gran === 'month') {
        keyFn = r => r.date.slice(0, 7);
      } else {
        keyFn = r => r.date;
      }

      const grouped = groupBy(dailyMerged, keyFn);
      const FR_MONTHS = ['jan', 'fév', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

      return Object.entries(grouped).map(([date, rows]) => {
        const d = new Date(date);
        let period = date;
        let label = date;

        if (gran === 'week') {
          const weekNum = getISOWeek(d);
          period = `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
          label = `W${String(weekNum).padStart(2, '0')} (${d.getFullYear()})`;
        } else if (gran === 'month') {
          period = date.slice(0, 7);
          label = `${FR_MONTHS[d.getMonth()]} ${d.getFullYear()}`;
        } else {
          label = `${d.getDate()} ${FR_MONTHS[d.getMonth()]}`;
        }

        const agg = {
          revenue: rows.reduce((s, r) => s + r.revenue, 0),
          sessions: rows.reduce((s, r) => s + r.sessions, 0),
          users: rows.reduce((s, r) => s + r.users, 0),
          transactions: rows.reduce((s, r) => s + r.transactions, 0),
          newCustomers: rows.reduce((s, r) => s + (r.newCustomers || 0), 0),
          cost: rows.reduce((s, r) => s + r.cost, 0),
          bounced: rows.reduce((s, r) => s + (r.bounceRate * r.sessions), 0),
        };

        return {
          period,
          label,
          ...agg,
          roas: agg.cost > 0 ? r2(agg.revenue / agg.cost) : 0,
          cvr: agg.sessions > 0 ? r2((agg.transactions / agg.sessions) * 100) : 0,
          aov: agg.transactions > 0 ? r2(agg.revenue / agg.transactions) : 0,
          bounceRate: agg.sessions > 0 ? r2((agg.bounced / agg.sessions) * 100) : 0,
          newCustomersRate: agg.transactions > 0 ? r2((agg.newCustomers / agg.transactions) * 100) : 0,
        };
      }).sort((a, b) => a.period.localeCompare(b.period));
    }

    const result = buildMergedTrend(ga4Rows, adsRows, granularity);

    ga4YtdCache.set(cacheKey, { data: result, ts: Date.now() });
    res.json(result);
  } catch (err) {
    console.error('GA4 Trend YTD error:', err);
    res.status(500).json({ error: err.message });
  }
});

function aggregateGA4Metrics(rows) {
  const revenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
  const sessions = rows.reduce((s, r) => s + (r.sessions || 0), 0);
  const transactions = rows.reduce((s, r) => s + (r.transactions || 0), 0);
  const newCustomers = rows.reduce((s, r) => s + (r.newCustomers || 0), 0);
  return {
    revenue,
    sessions,
    transactions,
    newCustomers,
    users: rows.reduce((s, r) => s + (r.users || 0), 0),
    cvr: sessions > 0 ? (transactions / sessions) * 100 : 0,
    aov: transactions > 0 ? revenue / transactions : 0,
    bounceRate: sessions > 0 ? rows.reduce((s, r) => s + (r.bounceRate || 0) * r.sessions, 0) / sessions : 0,
  };
}

app.get('/health', (_req, res) => res.json({ status: 'ok', source: DATA_SOURCE }));

const server = app.listen(PORT, () => {
  console.log(`MagicDash API running on http://localhost:${PORT} [source: ${DATA_SOURCE}] v2`);
  initCacheWarmer();
  initScheduler();
});

app.post('/api/system/reboot', (req, res) => {
  console.log('Reboot requested from dashboard...');
  res.json({ message: 'Rebooting...' });
  // Exit 42 is the signal for PM2 / nodemon to restart.
  // server.close() waits for all in-flight connections — long MC API calls or
  // HTTP keepalives can hang it forever, so we force-exit after 2s.
  setTimeout(() => {
    const forceExit = setTimeout(() => {
      console.log('Reboot: force-exiting (server.close hung)');
      process.exit(42);
    }, 2000);
    server.close(() => {
      clearTimeout(forceExit);
      process.exit(42);
    });
  }, 300);
});