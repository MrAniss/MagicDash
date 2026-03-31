import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';
import { authRouter, isAuthenticated } from './auth.js';
import { getRows, getComarketRows, clearCache } from './googleAdsClient.js';
import { generateRecommendations } from './services/recommendationEngine.js';
import { aggregateMetrics, groupBy } from './aggregation.js';
import { BRANDS } from './config/accounts.js';
import { getBudgetForMonth, getPCSBudgetForMonth, clearBudgetCache } from './services/budgetSheetReader.js';
import { AUTRES_PAYS_MARKETS } from './config/budgetMarketMap.js';
import { clearGA4Cache } from './ga4Client.js';
import { clearMcCache } from './services/merchantCenterClient.js';
import ga4Router from './routes/ga4.js';
import competitionRouter from './routes/competition.js';
import recommendationsRouter from './routes/recommendations.js';
import shoppingRouter from './routes/shopping.js';
import assistantRouter from './routes/assistant.js';

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_SOURCE = 'google-ads-api';

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());

authRouter(app);
app.use('/api/ga4', ga4Router);
app.use('/api/competition', competitionRouter);
app.use('/api/recommendations', recommendationsRouter);
app.use('/api/shopping', shoppingRouter);
app.use('/api/assistant', assistantRouter);

app.get('/api/mode', (_req, res) => res.json({
  source: DATA_SOURCE,
  authenticated: isAuthenticated(),
}));

app.post('/api/cache/clear', (_req, res) => {
  clearCache();
  clearBudgetCache();
  clearGA4Cache();
  clearMcCache();
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
      const m = aggregateMetrics(campRows);
      const firstRow = campRows[0];
      return {
        campaign_name: name,
        type: firstRow.campaign_type,
        status: firstRow.campaign_status === 'Active' ? 'ENABLED' : 'PAUSED',
        ...m,
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
    const { brand = 'Cocooncenter', market = 'ALL', month, compareTo = 'previous_month' } = req.query;
    if (!month) return res.status(400).json({ error: 'Missing month' });

    const isPascalCoste = brand === 'Pascal Coste Shopping' || brand === 'PASCAL_COSTE';

    // Map brand param
    const brandLabel = brand === 'PARAPHARMACIE_LAFAYETTE' ? 'Parapharmacie Lafayette'
                     : brand === 'COCOONCENTER' ? 'Cocooncenter'
                     : brand === 'PASCAL_COSTE' ? 'Pascal Coste Shopping'
                     : brand;
    const adsBrandKey = brandLabel === 'Cocooncenter' ? 'COCOONCENTER'
                      : brandLabel === 'Parapharmacie Lafayette' ? 'PARAPHARMACIE_LAFAYETTE'
                      : brandLabel === 'Pascal Coste Shopping' ? 'PASCAL_COSTE'
                      : brand;

    // Get budgets from Sheet
    let brandBudgets = {};
    let paraLafBudget = 0;
    if (isPascalCoste) {
      const pcsBudgets = await getPCSBudgetForMonth(month);
      brandBudgets = pcsBudgets[brandLabel] || {};
    } else {
      const budgets = await getBudgetForMonth(month);
      brandBudgets = budgets[brandLabel] || {};
      // When viewing Cocooncenter, also grab Para Laf budget for the consolidated row
      if (brandLabel === 'Cocooncenter') {
        paraLafBudget = budgets['Parapharmacie Lafayette']?.['FR'] || 0;
      }
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
    // When Cocooncenter + ALL markets, also fetch Para Laf for full consolidation
    const marketFilter = market !== 'ALL' && market !== 'Autres pays' ? market : undefined;
    const isCC = brandLabel === 'Cocooncenter';
    const includeParaLaf = isCC && market === 'ALL';

    const [currentRows, compRows, paraLafCurrentRows, paraLafCompRows] = await Promise.all([
      getRows({ brand: adsBrandKey, market: marketFilter, from, to, includeComarket: false }),
      getRows({ brand: adsBrandKey, market: marketFilter, from: compFrom, to: compTo, includeComarket: false }),
      includeParaLaf ? getRows({ brand: 'PARAPHARMACIE_LAFAYETTE', from, to, includeComarket: false }) : Promise.resolve([]),
      includeParaLaf ? getRows({ brand: 'PARAPHARMACIE_LAFAYETTE', from: compFrom, to: compTo, includeComarket: false }) : Promise.resolve([]),
    ]);

    // Merge Para Laf rows into CC rows for consolidated view
    const allCurrentRows = includeParaLaf ? [...currentRows, ...paraLafCurrentRows] : currentRows;
    const allCompRows    = includeParaLaf ? [...compRows,    ...paraLafCompRows]    : compRows;

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

    const cur  = aggregateForMarket(allCurrentRows, market);
    const comp = aggregateForMarket(allCompRows,    market);

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

    // Budget pacing (cost) — include Para Laf budget when CC ALL view
    const ccBudget = market === 'Autres pays' ? (brandBudgets['Autres pays'] || 0)
                   : market !== 'ALL' ? (brandBudgets[market] || 0)
                   : Object.values(brandBudgets).reduce((s, v) => s + v, 0);
    const budgetValue = (includeParaLaf && market === 'ALL') ? ccBudget + paraLafBudget : ccBudget;

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

      // Inject "France Para Laf" row just after "FR" when viewing Cocooncenter ALL
      if (isCC && paraLafCurrentRows.length > 0) {
        const paraSpend = r2(paraLafCurrentRows.reduce((s, r) => s + r.cost, 0));
        const paraRemaining = paraLafBudget - paraSpend;
        const paraRemDays = daysTotal - daysElapsed;
        const paraDailyActual = daysElapsed > 0 ? r2(paraSpend / daysElapsed) : 0;
        const paraDailyTarget = paraRemaining > 0 && paraRemDays > 0 ? r2(paraRemaining / paraRemDays) : 0;
        const paraDailyAvg = daysElapsed > 0 ? paraSpend / daysElapsed : 0;
        const paraProjBase = r2(paraDailyAvg * daysTotal);
        const paraTheoretical = paraLafBudget > 0 ? (paraLafBudget / daysTotal) * daysElapsed : 0;
        const paraPacing = paraTheoretical > 0 ? r2((paraSpend / paraTheoretical) * 100) : 0;
        let paraStatus = 'on_track';
        if (paraPacing > 105) paraStatus = 'over';
        else if (paraPacing < 85) paraStatus = 'under';

        const paraRow = {
          market: 'France Para Laf',
          budget: paraLafBudget, spend_to_date: paraSpend,
          pacing_pct: paraPacing,
          projection_base: paraProjBase,
          projection_optimistic: r2(paraProjBase * 1.15),
          projection_pessimistic: r2(paraProjBase * 0.85),
          status: paraStatus,
          daily_actual: paraDailyActual,
          daily_target: paraDailyTarget,
          daily_delta: r2(paraDailyActual - paraDailyTarget),
          isGuest: true, // flag: this row belongs to a different brand
        };

        // Insert after FR row
        const frIdx = marketsTable.findIndex(m => m.market === 'FR');
        if (frIdx >= 0) {
          marketsTable.splice(frIdx + 1, 0, paraRow);
        } else {
          marketsTable.unshift(paraRow);
        }
      }
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

function r2(v) { return Math.round(v * 100) / 100; }

// ─── Budget Recommendations ────────────────────────────
app.get('/api/budget/recommendations', async (req, res) => {
  try {
    const { brand = 'Cocooncenter', month, granularity = 'market' } = req.query;
    if (!month) return res.status(400).json({ error: 'Missing month' });

    const brandLabel = brand === 'PARAPHARMACIE_LAFAYETTE' ? 'Parapharmacie Lafayette'
                     : brand === 'COCOONCENTER' ? 'Cocooncenter'
                     : brand === 'PASCAL_COSTE' ? 'Pascal Coste Shopping'
                     : brand;
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

    const isCC = adsBrandKey === 'COCOONCENTER';
    const fromStr = firstDay.toISOString().slice(0, 10);

    const [rows, paraLafRows] = await Promise.all([
      getRows({ brand: adsBrandKey, from: fromStr, to: from }),
      isCC ? getRows({ brand: 'PARAPHARMACIE_LAFAYETTE', from: fromStr, to: from }) : Promise.resolve([]),
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

    // When Cocooncenter, also add Para Laf as a "guest" market for recommendations
    if (isCC && paraLafRows.length > 0) {
      const allBudgets = await getBudgetForMonth(month);
      const paraLafBudgetRec = allBudgets['Parapharmacie Lafayette']?.['FR'] || 0;
      const paraSpend = r2(paraLafRows.reduce((s, r) => s + r.cost, 0));
      const paraDailyAvg = daysElapsed > 0 ? paraSpend / daysElapsed : 0;
      const paraProjBase = r2(paraDailyAvg * daysTotal);
      const paraTheoretical = paraLafBudgetRec > 0 ? (paraLafBudgetRec / daysTotal) * daysElapsed : 0;
      const paraPacingPct = paraTheoretical > 0 ? r2((paraSpend / paraTheoretical) * 100) : 100;
      const paraRemaining = paraLafBudgetRec - paraSpend;
      const paraRemDays = daysTotal - daysElapsed;
      pacingMarkets.push({
        market: 'France Para Laf',
        adsMarket: 'FR',
        adsBrand: 'PARAPHARMACIE_LAFAYETTE',
        budget: paraLafBudgetRec,
        spend_to_date: paraSpend,
        pacing_pct: paraPacingPct,
        projection_base: paraProjBase,
        daily_actual: daysElapsed > 0 ? r2(paraSpend / daysElapsed) : 0,
        daily_target: paraRemaining > 0 && paraRemDays > 0 ? r2(paraRemaining / paraRemDays) : 0,
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
    const { from, to, compareTo = 'previous_period', granularity } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const comarketRows = await getComarketRows({ from, to });
    const current = aggregateMetrics(comarketRows);

    // Get total FR spend for context
    const frRows = await getRows({ brand: 'COCOONCENTER', market: 'FR', from, to, includeComarket: true });
    const totalFR = aggregateMetrics(frRows);

    // Comparison
    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
    const prevComarketRows = await getComarketRows({ from: compFrom, to: compTo });
    const previous = aggregateMetrics(prevComarketRows);

    const deltas = {
      spend_pct: pctChange(current.spend, previous.spend),
      revenue_pct: pctChange(current.revenue, previous.revenue),
      roas_pct: pctChange(current.roas, previous.roas),
      conversions_pct: pctChange(current.conversions, previous.conversions),
      ctr_pct: pctChange(current.ctr, previous.ctr),
    };

    // % of total FR
    const pctOfFR = {
      spend: totalFR.spend > 0 ? Math.round((current.spend / totalFR.spend) * 10000) / 100 : 0,
      revenue: totalFR.revenue > 0 ? Math.round((current.revenue / totalFR.revenue) * 10000) / 100 : 0,
    };

    // Campaign breakdown
    const byCampaign = groupBy(comarketRows, r => r.campaign);
    const campaigns = Object.entries(byCampaign).map(([name, campRows]) => {
      const m = aggregateMetrics(campRows);
      const firstRow = campRows[0];
      // Extract partner brand from campaign name
      const partnerBrand = extractComarketBrand(name);
      return {
        campaign_name: name,
        partner_brand: partnerBrand,
        status: firstRow.campaign_status === 'Active' ? 'ENABLED' : 'PAUSED',
        ...m,
      };
    });
    campaigns.sort((a, b) => b.spend - a.spend);

    // Trend
    const days = daysBetween(from, to);
    const gran = granularity || (days <= 90 ? 'day' : 'week');
    const trend = buildTrendSeries(comarketRows, gran);

    res.json({
      kpis: { current, previous, deltas, pctOfFR },
      campaigns,
      trend,
    });
  } catch (err) {
    console.error('Comarket error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── Helpers ───────────────────────────────────────────

function extractComarketBrand(campaignName) {
  const parts = campaignName.split('|').map(p => p.trim());
  const idx = parts.findIndex(p => p.toLowerCase().includes('comarket'));
  if (idx === -1) return '';
  return parts[idx + 1] || '';
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

  const compTo = new Date(fromDate);
  compTo.setDate(compTo.getDate() - 1);
  const compFrom = new Date(compTo);
  compFrom.setDate(compFrom.getDate() - diffDays);
  return { compFrom: fmtDate(compFrom), compTo: fmtDate(compTo) };
}

function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

function daysBetween(from, to) {
  return Math.max(1, Math.round((new Date(to) - new Date(from)) / (1000 * 60 * 60 * 24)) + 1);
}

function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

// ─── Budget Daily Spend YTD ────────────────────────────
const dailySpendCache = new Map();
const DAILY_CACHE_TTL = 60 * 60 * 1000; // 1h

app.get('/api/budget/daily-spend', async (req, res) => {
  try {
    const { brand = 'Cocooncenter', market = 'ALL', year } = req.query;
    const targetYear = parseInt(year || new Date().getFullYear(), 10);
    const cacheKey = `daily-spend|${brand}|${market}|${targetYear}`;

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
        : getRows({ brand: adsBrandKey, market: marketFilter, from, to, includeComarket: false }),
      (isCC && (market === 'ALL' || isParaLafMarket))
        ? getRows({ brand: 'PARAPHARMACIE_LAFAYETTE', from, to, includeComarket: false })
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

app.get('/health', (_req, res) => res.json({ status: 'ok', source: DATA_SOURCE }));

app.listen(PORT, () => {
  console.log(`SEA Dashboard API running on http://localhost:${PORT} [source: ${DATA_SOURCE}]`);
});
