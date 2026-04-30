import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import { authRouter, isAuthenticated } from './auth.js';
import { getRows, getComarketRows, clearCache, clearScoringCache } from './googleAdsClient.js';
import { generateRecommendations } from './services/recommendationEngine.js';
import { aggregateMetrics, groupBy } from './aggregation.js';
import { BRANDS } from './config/accounts.js';
import { getBudgetForMonth, getPCSBudgetForMonth, clearBudgetCache } from './services/budgetSheetReader.js';
import { AUTRES_PAYS_MARKETS } from './config/budgetMarketMap.js';
import { clearGA4Cache, getGA4Rows } from './ga4Client.js';
import { clearMcCache } from './services/merchantCenterClient.js';
import { initCacheWarmer } from './services/cacheWarmer.js';
import ga4Router from './routes/ga4.js';
import recommendationsRouter from './routes/recommendations.js';
import shoppingRouter from './routes/shopping.js';
import reportsRouter from './routes/reports.js';
import { clearGscCache } from './searchConsoleClient.js';

import { getComparisonDates, fmtDate, daysBetween, r2, pctChange, getISOWeek } from './dateUtils.js';

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_SOURCE = 'google-ads-api';

const allowedOrigins = [
  'http://localhost:5173',
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));
app.use(express.json());

authRouter(app);
app.use('/api/ga4', ga4Router);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/reports', reportsRouter);

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
  clearGscCache();
  ytdCache.clear();
  ga4YtdCache.clear();
  res.json({ ok: true });
});

// ─── KPIs ──────────────────────────────────────────────
app.get('/api/kpis', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', includeComarket } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const comarket = includeComarket === 'true';
    const currentRows = await getRows({ brand, market, from, to, includeComarket: comarket });
    const current = aggregateMetrics(currentRows);

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, market, from: compFrom, to: compTo, includeComarket: comarket });
    const previous = aggregateMetrics(prevRows);

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

    res.json({ current, previous, deltas });
  } catch (err) {
    console.error('KPI error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Trend ─────────────────────────────────────────────
app.get('/api/trend', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', granularity, includeComarket } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const comarket = includeComarket === 'true';
    const days = daysBetween(from, to);
    const gran = granularity || (days <= 90 ? 'day' : 'week');

    const currentRows = await getRows({ brand, market, from, to, includeComarket: comarket });
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, market, from: compFrom, to: compTo, includeComarket: comarket });

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
    const { brand = 'ALL', from, to, compareTo = 'previous_period', includeComarket } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const comarket = includeComarket === 'true';
    const currentRows = await getRows({ brand, from, to, includeComarket: comarket });
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, from: compFrom, to: compTo, includeComarket: comarket });

    const currentByMarket = groupBy(currentRows, r => `${r.brand}|${r.market}`);
    const prevByMarket = groupBy(prevRows, r => `${r.brand}|${r.market}`);

    const results = [];
    for (const [key, rows] of Object.entries(currentByMarket)) {
      const [brandKey, market] = key.split('|');
      const cur = aggregateMetrics(rows);
      const prev = aggregateMetrics(prevByMarket[key] || []);

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
    const { brand = 'ALL', market = 'ALL', from, to, type = 'ALL', includeComarket, compareTo = 'previous_period' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const comarket = includeComarket === 'true';
    const rows = await getRows({ brand, market, from, to, campaignType: type, includeComarket: comarket });

    // Also get comparison for type-level deltas
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, market, from: compFrom, to: compTo, campaignType: type, includeComarket: comarket });

    // Group by campaign name
    const byCampaign = groupBy(rows, r => r.campaign);
    const prevByCampaign = groupBy(prevRows, r => r.campaign);

    const campaigns = Object.entries(byCampaign).map(([name, campRows]) => {
      const cur = aggregateMetrics(campRows);
      const prev = aggregateMetrics(prevByCampaign[name] || []);
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

    // Group by type for summary
    const byType = groupBy(rows, r => r.campaign_type);
    const prevByType = groupBy(prevRows, r => r.campaign_type);
    const totalSpend = rows.reduce((s, r) => s + r.cost, 0);

    const typeSummary = Object.entries(byType).map(([typeName, typeRows]) => {
      const cur = aggregateMetrics(typeRows);
      const prev = aggregateMetrics(prevByType[typeName] || []);
      return {
        type: typeName,
        spend: cur.spend,
        spend_pct: totalSpend > 0 ? Math.round((cur.spend / totalSpend) * 10000) / 100 : 0,
        revenue: cur.revenue,
        roas: cur.roas,
        conversions: cur.conversions,
        cvr: cur.cvr,
        clicks: cur.clicks,
        ctr: cur.ctr,
        aov: cur.aov,
        delta_roas: pctChange(cur.roas, prev.roas),
        delta_spend: pctChange(cur.spend, prev.spend),
        delta_aov: pctChange(cur.aov, prev.aov),
        delta_impressionShare: pctChange(cur.impressionShare, prev.impressionShare),
        delta_revenue: pctChange(cur.revenue, prev.revenue),
        delta_cvr: pctChange(cur.cvr, prev.cvr),
        delta_clicks: pctChange(cur.clicks, prev.clicks),
        delta_ctr: pctChange(cur.ctr, prev.ctr),
        delta_conversions: pctChange(cur.conversions, prev.conversions),
      };
    });

    campaigns.sort((a, b) => b.spend - a.spend);
    typeSummary.sort((a, b) => b.spend - a.spend);

    res.json({ campaigns, typeSummary });
  } catch (err) {
    console.error('Campaigns error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Granularity ───────────────────────────────────────
app.get('/api/granularity', async (req, res) => {
  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period', granularity = 'day', includeComarket } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const comarket = includeComarket === 'true';
    const currentRows = await getRows({ brand, market, from, to, includeComarket: comarket });
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevRows = await getRows({ brand, market, from: compFrom, to: compTo, includeComarket: comarket });

    const currentSeries = buildTrendSeries(currentRows, granularity);
    const prevSeries = buildTrendSeries(prevRows, granularity);

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
    const { brand = 'Cocooncenter', market = 'ALL', month, compareTo = 'previous_month', includeComarket } = req.query;
    const comarket = includeComarket === 'true';
    if (!month) return res.status(400).json({ error: 'Missing month' });

    // Map brand param
    const brandLabel = brand === 'PARAPHARMACIE_LAFAYETTE' || brand === 'Parapharmacie Lafayette' ? 'Parapharmacie Lafayette'
                     : brand === 'PASCAL_COSTE' || brand === 'Pascal Coste Shopping' ? 'Pascal Coste Shopping'
                     : 'Cocooncenter';
    
    const adsBrandKey = brandLabel === 'Cocooncenter' ? 'COCOONCENTER'
                      : brandLabel === 'Parapharmacie Lafayette' ? 'PARAPHARMACIE_LAFAYETTE'
                      : 'PASCAL_COSTE';

    const isPascalCoste = adsBrandKey === 'PASCAL_COSTE';

    // Get budgets from Sheet
    let brandBudgets = {};
    if (isPascalCoste) {
      const pcsBudgets = await getPCSBudgetForMonth(month);
      brandBudgets = pcsBudgets[brandLabel] || {};
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
      getRows({ brand: adsBrandKey, market: marketFilter, from, to, includeComarket: comarket }),
      getRows({ brand: adsBrandKey, market: marketFilter, from: compFrom, to: compTo, includeComarket: comarket }),
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
    const { brand = 'Cocooncenter', month, granularity = 'market' } = req.query;
    if (!month) return res.status(400).json({ error: 'Missing month' });

    const brandLabel = brand === 'PARAPHARMACIE_LAFAYETTE' || brand === 'Parapharmacie Lafayette' ? 'Parapharmacie Lafayette'
                     : brand === 'PASCAL_COSTE' || brand === 'Pascal Coste Shopping' ? 'Pascal Coste Shopping'
                     : 'Cocooncenter';
    const adsBrandKey = brandLabel === 'Cocooncenter' ? 'COCOONCENTER'
                      : brandLabel === 'Parapharmacie Lafayette' ? 'PARAPHARMACIE_LAFAYETTE'
                      : 'PASCAL_COSTE';

    // Get pacing data for all markets (needed for budget/projection signals)
    const isPCS = adsBrandKey === 'PASCAL_COSTE';
    const budgets = isPCS
      ? await getPCSBudgetForMonth(month)
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

// ─── Comarket ──────────────────────────────────────────
app.get('/api/comarket', async (req, res) => {
  try {
    const { from, to, compareTo = 'previous_period', granularity, partnerBrand } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    let comarketRows = await getComarketRows({ from, to });
    
    // Get total FR spend for context (always global FR)
    const frRows = await getRows({ brand: 'COCOONCENTER', market: 'FR', from, to, includeComarket: true });
    const totalFR = aggregateMetrics(frRows);

    // Comparison
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    let prevComarketRows = await getComarketRows({ from: compFrom, to: compTo });

    // Extract all available brands before filtering
    const allBrands = Array.from(new Set(comarketRows.map(r => extractComarketBrand(r.campaign)))).filter(Boolean).sort();

    // Filter by brand if requested
    if (partnerBrand && partnerBrand !== 'ALL') {
      comarketRows = comarketRows.filter(r => extractComarketBrand(r.campaign) === partnerBrand);
      prevComarketRows = prevComarketRows.filter(r => extractComarketBrand(r.campaign) === partnerBrand);
    }

    const current = aggregateMetrics(comarketRows);
    const previous = aggregateMetrics(prevComarketRows);

    const deltas = {
      impressions_pct: pctChange(current.impressions, previous.impressions),
      clicks_pct:      pctChange(current.clicks, previous.clicks),
      ctr_pct:         pctChange(current.ctr, previous.ctr),
      spend_pct:       pctChange(current.spend, previous.spend),
      cpc_pct:         pctChange(current.cpc, previous.cpc),
      conversions_pct: pctChange(current.conversions, previous.conversions),
      revenue_pct:     pctChange(current.revenue, previous.revenue),
      cvr_pct:         pctChange(current.cvr, previous.cvr),
      roas_pct:        pctChange(current.roas, previous.roas),
    };

    // % of total FR
    const pctOfFR = {
      spend: totalFR.spend > 0 ? Math.round((current.spend / totalFR.spend) * 10000) / 100 : 0,
      revenue: totalFR.revenue > 0 ? Math.round((current.revenue / totalFR.revenue) * 10000) / 100 : 0,
    };

    // Campaign breakdown with intelligent reconciliation
    const byCampaign = groupBy(comarketRows, r => r.campaign);
    const prevByCampaign = groupBy(prevComarketRows, r => r.campaign);
    
    // Build a fallback map for reconciliation (Brand + Type)
    const prevByReconKey = groupBy(prevComarketRows, r => `${extractComarketBrand(r.campaign)}|${r.campaign_type}`);

    const campaigns = Object.entries(byCampaign).map(([name, campRows]) => {
      const m = aggregateMetrics(campRows);
      const firstRow = campRows[0];
      const partnerBrandName = extractComarketBrand(name);
      const campaignType = firstRow.campaign_type;

      // 1. Try exact name match
      let pm = aggregateMetrics(prevByCampaign[name] || []);
      
      // 2. If no exact match and it's a comarket campaign, try matching by Brand + Type
      if (pm.impressions === 0) {
        const reconKey = `${partnerBrandName}|${campaignType}`;
        const potentialMatches = prevByReconKey[reconKey] || [];
        if (potentialMatches.length > 0) {
           // Use the aggregate of that brand/type from last year as a proxy
           pm = aggregateMetrics(potentialMatches);
        }
      }

      return {
        campaign_name: name,
        partner_brand: partnerBrandName,
        status: firstRow.campaign_status === 'Active' ? 'ENABLED' : 'PAUSED',
        ...m,
        delta_impressions: pctChange(m.impressions, pm.impressions),
        delta_clicks:      pctChange(m.clicks, pm.clicks),
        delta_ctr:         pctChange(m.ctr, pm.ctr),
        delta_spend:       pctChange(m.spend, pm.spend),
        delta_cpc:         pctChange(m.cpc, pm.cpc),
        delta_conversions: pctChange(m.conversions, pm.conversions),
        delta_revenue:     pctChange(m.revenue, pm.revenue),
        delta_cvr:         pctChange(m.cvr, pm.cvr),
        delta_roas:        pctChange(m.roas, pm.roas),
      };
    });

    // Brand-level summary (Reconciliation)
    const currentByBrand = groupBy(comarketRows, r => extractComarketBrand(r.campaign));
    const prevByBrand = groupBy(prevComarketRows, r => extractComarketBrand(r.campaign));
    
    const brandSummary = Object.entries(currentByBrand).map(([bName, bRows]) => {
      const cur = aggregateMetrics(bRows);
      const prev = aggregateMetrics(prevByBrand[bName] || []);
      return {
        brand: bName,
        ...cur,
        delta_impressions: pctChange(cur.impressions, prev.impressions),
        delta_clicks:      pctChange(cur.clicks, prev.clicks),
        delta_ctr:         pctChange(cur.ctr, prev.ctr),
        delta_spend:       pctChange(cur.spend, prev.spend),
        delta_cpc:         pctChange(cur.cpc, prev.cpc),
        delta_conversions: pctChange(cur.conversions, prev.conversions),
        delta_revenue:     pctChange(cur.revenue, prev.revenue),
        delta_cvr:         pctChange(cur.cvr, prev.cvr),
        delta_roas:        pctChange(cur.roas, prev.roas),
      };
    });

    campaigns.sort((a, b) => b.spend - a.spend);
    brandSummary.sort((a, b) => b.spend - a.spend);

    // Trend
    const days = daysBetween(from, to);
    const gran = granularity || (days <= 90 ? 'day' : 'week');
    const trend = buildTrendSeries(comarketRows, gran);

    res.json({
      kpis: { current, previous, deltas, pctOfFR },
      campaigns,
      brandSummary,
      trend,
      availableBrands: allBrands
    });
  } catch (err) {
    console.error('Comarket error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ───────────────────────────────────────────

function extractComarketBrand(campaignName) {
  // Split by | or - and trim each part
  const parts = campaignName.split(/[|-]/).map(p => p.trim());
  const idx = parts.findIndex(p => p.toLowerCase().includes('comarket'));
  if (idx === -1) return '';
  
  let rawBrand = parts[idx + 1] || '';
  
  // Normalization
  if (rawBrand.toLowerCase().includes('bioderma')) return 'Bioderma';
  if (rawBrand.toLowerCase().includes('eucerin')) return 'Eucerin';
  if (rawBrand.toLowerCase().includes('cooper')) return 'Cooper';
  
  return rawBrand;
}

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
    const { brand = 'ALL', market = 'ALL', granularity = 'week', includeComarket, onlyComarket, partnerBrand } = req.query;
    const comarket = includeComarket === 'true' || onlyComarket === 'true';
    const isOnlyComarket = onlyComarket === 'true';
    
    const cacheKey = `ytd|${brand}|${market}|${granularity}|${comarket}|${isOnlyComarket}|${partnerBrand || 'ALL'}`;

    const cached = ytdCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < YTD_CACHE_TTL) {
      return res.json(cached.data);
    }

    const today = new Date();
    const from = `${today.getFullYear()}-01-01`;
    const to = fmtDate(today);

    let rows = await getRows({ brand, market, from, to, includeComarket: comarket });
    
    if (isOnlyComarket) {
      rows = rows.filter(r => r.campaign.toLowerCase().includes('comarket'));
    }
    
    if (partnerBrand && partnerBrand !== 'ALL') {
      rows = rows.filter(r => extractComarketBrand(r.campaign) === partnerBrand);
    }

    const series = buildTrendSeries(rows, granularity);

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

      return {
        period,
        label,
        cost:        r2(item.spend),
        clicks:      item.clicks,
        impressions: item.impressions,
        conversions: r2(item.conversions),
        revenue:     r2(item.revenue),
        roas:        r2(item.roas),
        cpc:         r2(item.cpc),
        cvr:         r2(item.cvr),
        ctr:         r2(item.ctr),
        aov:         r2(item.aov),
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
    const { brand = 'Cocooncenter', market = 'ALL', year, includeComarket } = req.query;
    const comarket = includeComarket === 'true';
    const targetYear = parseInt(year || new Date().getFullYear(), 10);
    const cacheKey = `daily-spend|${brand}|${market}|${targetYear}|${comarket}`;

    const cached = dailySpendCache.get(cacheKey);
    if (cached && (Date.now() - cached.ts) < DAILY_CACHE_TTL) {
      return res.json(cached.data);
    }

    const today = new Date();
    const from = `${targetYear}-01-01`;
    const to = today.getFullYear() === targetYear ? fmtDate(today) : `${targetYear}-12-31`;

    const brandLabel = brand === 'PARAPHARMACIE_LAFAYETTE' ? 'Parapharmacie Lafayette'
                     : brand === 'COCOONCENTER'            ? 'Cocooncenter'
                     : brand === 'PASCAL_COSTE'            ? 'Pascal Coste Shopping'
                     : brand;
    const adsBrandKey = brandLabel === 'Cocooncenter'            ? 'COCOONCENTER'
                      : brandLabel === 'Parapharmacie Lafayette' ? 'PARAPHARMACIE_LAFAYETTE'
                      : 'PASCAL_COSTE';
    const isPCS = adsBrandKey === 'PASCAL_COSTE';

    const isCC = adsBrandKey === 'COCOONCENTER';
    const isParaLafMarket = market === 'France Para Laf';
    const marketFilter = (market && market !== 'ALL' && !isParaLafMarket) ? market : undefined;

    // Fetch CC rows + Para Laf rows in parallel when CC brand
    const [rows, paraLafRows] = await Promise.all([
      isParaLafMarket
        ? Promise.resolve([])
        : getRows({ brand: adsBrandKey, market: marketFilter, from, to, includeComarket: comarket }),
      (isCC && (market === 'ALL' || isParaLafMarket))
        ? getRows({ brand: 'PARAPHARMACIE_LAFAYETTE', from, to, includeComarket: comarket })
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
      const budgets = isPCS ? await getPCSBudgetForMonth(m) : await getBudgetForMonth(m);
      budgetsByMonth[m] = budgets[brandLabel] || {};
      if (isCC) paraLafBudgetsByMonth[m] = budgets['Parapharmacie Lafayette'] || {};
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
    const adsRows = await getRows({ brand, market, from, to, includeComarket: true });

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
  console.log(`SEA Dashboard API running on http://localhost:${PORT} [source: ${DATA_SOURCE}] v2`);
  initCacheWarmer();
});

app.post('/api/system/reboot', (req, res) => {
  console.log('Reboot requested from dashboard...');
  res.json({ message: 'Rebooting...' });
  // Exit 42 is the signal for run.js wrapper to restart. nodemon also restarts on exit.
  // If neither wrapper is in place, the process just stops.
  setTimeout(() => {
    server.close(() => {
      setTimeout(() => process.exit(42), 200);
    });
  }, 300);
});