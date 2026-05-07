import { Router } from 'express';
import { getRows } from '../googleAdsClient.js';
import { aggregateMetrics, groupBy } from '../aggregation.js';
import { isAuthenticated } from '../auth.js';
import { getGA4Kpis, getGA4ByCampaign } from '../ga4Client.js';

const router = Router();

const GA4_SEA_SOURCE_MEDIUM = 'google / cpc';

function r2(v) { return Math.round((v || 0) * 100) / 100; }

function applyGA4ConvLocal(adsAgg, ga4Agg) {
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

router.get('/weekly-summary', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const { brand = 'ALL', market = 'ALL', dataSource = 'ads' } = req.query;

    // 1. Calculate periods
    const now = new Date();
    const lastMonday = new Date(now);
    const day = now.getDay();
    const diffToLastMonday = (day === 0 ? 6 : day - 1) + 7;
    lastMonday.setDate(now.getDate() - diffToLastMonday);
    lastMonday.setHours(0, 0, 0, 0);

    const lastSunday = new Date(lastMonday);
    lastSunday.setDate(lastMonday.getDate() + 6);
    lastSunday.setHours(23, 59, 59, 999);

    const prevMonday = new Date(lastMonday);
    prevMonday.setDate(lastMonday.getDate() - 7);
    const prevSunday = new Date(prevMonday);
    prevSunday.setDate(prevMonday.getDate() + 6);

    const lastYearMonday = new Date(lastMonday);
    lastYearMonday.setFullYear(lastYearMonday.getFullYear() - 1);
    const lastYearSunday = new Date(lastSunday);
    lastYearSunday.setFullYear(lastYearSunday.getFullYear() - 1);

    const periods = {
      current: { 
        from: fmt(lastMonday), 
        to: fmt(lastSunday), 
        week: getWeekNumber(lastMonday), 
        year: lastMonday.getFullYear(),
        label: `W${getWeekNumber(lastMonday)} ${lastMonday.getFullYear()}`
      },
      previous: { 
        from: fmt(prevMonday), 
        to: fmt(prevSunday), 
        week: getWeekNumber(prevMonday), 
        year: prevMonday.getFullYear(),
        label: `Last Week`
      },
      lastYear: { 
        from: fmt(lastYearMonday), 
        to: fmt(lastYearSunday), 
        week: getWeekNumber(lastYearMonday), 
        year: lastYearMonday.getFullYear(),
        label: `N-1`
      },
    };

    // 2. Fetch data (filtered by market if provided)
    // Always include CoMarket data for accurate totals (especially for France)
    const [rowsW, rowsW1, rowsW_N1] = await Promise.all([
      getRows({ brand, market, from: periods.current.from, to: periods.current.to, includeComarket: true }),
      getRows({ brand, market, from: periods.previous.from, to: periods.previous.to, includeComarket: true }),
      getRows({ brand, market, from: periods.lastYear.from, to: periods.lastYear.to, includeComarket: true }),
    ]);

    // 3. Determine Granularity
    // Use campaign granularity if:
    // - A specific market is selected (market !== 'ALL')
    // - OR the brand inherently has only one market
    const marketsDetected = Array.from(new Set(rowsW.map(r => r.market))).filter(Boolean);
    const useCampaignGranularity = (market !== 'ALL') || (brand !== 'ALL' && marketsDetected.length <= 1);

    let drilldownW, drilldownW1, drilldownW_N1;
    if (useCampaignGranularity) {
      drilldownW = groupByCampaign(rowsW);
      drilldownW1 = groupByCampaign(rowsW1);
      drilldownW_N1 = groupByCampaign(rowsW_N1);
    } else {
      drilldownW = groupByMarket(rowsW);
      drilldownW1 = groupByMarket(rowsW1);
      drilldownW_N1 = groupByMarket(rowsW_N1);
    }

    // ── GA4 reconciliation ─────────────────────────────
    // When dataSource === 'ga4', overlay GA4 conv-side metrics on each
    // drill-down bucket (campaign or market) and on the global aggregate
    // for the 3 periods (current, previous, last year).
    if (dataSource === 'ga4') {
      const fetchGA4Drill = async (from, to) => {
        if (useCampaignGranularity) {
          const list = await getGA4ByCampaign({ brand, market, from, to, sourceMedium: GA4_SEA_SOURCE_MEDIUM });
          const map = {};
          for (const r of list) map[r.campaignName] = r;
          return map;
        }
        // Per-market granularity: fetch GA4 KPIs per (brand, market) seen in Ads rows
        // Since `brand` may be 'ALL', we need to iterate over (brand, market) pairs
        // present in the Ads result for this period. Safer: derive from rowsW unions.
        const adsRowsForPeriod = await getRows({ brand, market, from, to, includeComarket: true });
        const pairs = new Set(adsRowsForPeriod.map(r => `${r.brand}|${r.market}`));
        const map = {};
        await Promise.all([...pairs].map(async (pair) => {
          const [bKey, mkt] = pair.split('|');
          const k = await getGA4Kpis({ brand: bKey, market: mkt, from, to, sourceMedium: GA4_SEA_SOURCE_MEDIUM });
          // groupByMarket keys by market name, so aggregate across brands sharing a market
          if (!map[mkt]) map[mkt] = { sessions: 0, transactions: 0, revenue: 0 };
          map[mkt].sessions += k.sessions || 0;
          map[mkt].transactions += k.transactions || 0;
          map[mkt].revenue += k.revenue || 0;
        }));
        return map;
      };

      const [ga4W, ga4W1, ga4W_N1] = await Promise.all([
        fetchGA4Drill(periods.current.from, periods.current.to),
        fetchGA4Drill(periods.previous.from, periods.previous.to),
        fetchGA4Drill(periods.lastYear.from, periods.lastYear.to),
      ]);

      const overlay = (drill, ga4Map) => {
        for (const k of Object.keys(drill)) {
          drill[k] = applyGA4ConvLocal(drill[k], ga4Map[k]);
        }
      };
      overlay(drilldownW, ga4W);
      overlay(drilldownW1, ga4W1);
      overlay(drilldownW_N1, ga4W_N1);
    }

    const allKeys = Array.from(new Set([
      ...Object.keys(drilldownW),
      ...Object.keys(drilldownW1),
      ...Object.keys(drilldownW_N1)
    ]));

    const reports = allKeys.map(key => {
      const current = drilldownW[key] || emptyMetrics();
      const previous = drilldownW1[key] || emptyMetrics();
      const lastYear = drilldownW_N1[key] || emptyMetrics();

      return {
        key,
        current,
        previous,
        lastYear,
        deltasW1: computeDeltas(current, previous),
        deltasLY: computeDeltas(current, lastYear)
      };
    }).filter(m => m.current.spend > 0 || m.previous.spend > 0);

    // 4. Global aggregation
    const global = {
      current: aggregateMetrics(rowsW),
      previous: aggregateMetrics(rowsW1),
      lastYear: aggregateMetrics(rowsW_N1),
    };

    if (dataSource === 'ga4') {
      const [g4W, g4W1, g4W_N1] = await Promise.all([
        getGA4Kpis({ brand, market, from: periods.current.from, to: periods.current.to, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
        getGA4Kpis({ brand, market, from: periods.previous.from, to: periods.previous.to, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
        getGA4Kpis({ brand, market, from: periods.lastYear.from, to: periods.lastYear.to, sourceMedium: GA4_SEA_SOURCE_MEDIUM }),
      ]);
      global.current  = applyGA4ConvLocal(global.current,  g4W);
      global.previous = applyGA4ConvLocal(global.previous, g4W1);
      global.lastYear = applyGA4ConvLocal(global.lastYear, g4W_N1);
    }

    global.deltasW1 = computeDeltas(global.current, global.previous);
    global.deltasLY = computeDeltas(global.current, global.lastYear);

    // 5. Insights
    const insights = generateInsights(reports, global, useCampaignGranularity);

    res.json({
      periods,
      global,
      reports,
      insights,
      granularity: useCampaignGranularity ? 'campaign' : 'market',
      dataSource,
    });

  } catch (err) {
    console.error('Weekly summary error:', err);
    res.status(500).json({ error: err.message });
  }
});

function fmt(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getWeekNumber(d) {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

function groupByMarket(rows) {
  const grouped = groupBy(rows, r => r.market || 'Unknown');
  const result = {};
  for (const [market, marketRows] of Object.entries(grouped)) {
    result[market] = aggregateMetrics(marketRows);
  }
  return result;
}

function groupByCampaign(rows) {
  const grouped = groupBy(rows, r => r.campaign || 'Unknown');
  const result = {};
  for (const [campaign, campaignRows] of Object.entries(grouped)) {
    result[campaign] = aggregateMetrics(campaignRows);
  }
  return result;
}

function emptyMetrics() {
  return { spend: 0, revenue: 0, roas: 0, conversions: 0, cvr: 0, clicks: 0, impressions: 0, ctr: 0, aov: 0, cpc: 0 };
}

function computeDeltas(current, previous) {
  const pct = (curr, prev) => {
    if (!prev || prev === 0) return curr > 0 ? 100 : 0;
    return ((curr - prev) / prev) * 100;
  };

  return {
    spend: pct(current.spend, previous.spend),
    revenue: pct(current.revenue, previous.revenue),
    roas: pct(current.roas, previous.roas),
    conversions: pct(current.conversions, previous.conversions),
    cvr: pct(current.cvr, previous.cvr),
  };
}

function generateInsights(reports, global, isCampaign) {
  const MIN_SPEND_FOR_VAR = isCampaign ? 20 : 100; // Lower threshold for campaigns

  const tops = [...reports]
    .filter(m => m.current.spend > (isCampaign ? 10 : 50) && m.previous.spend > MIN_SPEND_FOR_VAR) 
    .sort((a, b) => b.deltasW1.roas - a.deltasW1.roas)
    .slice(0, 3)
    .map(m => ({ label: m.key, roas: m.current.roas, delta: m.deltasW1.roas, type: 'ROAS' }));

  const flops = [...reports]
    .filter(m => m.current.spend > (isCampaign ? 10 : 50) && m.previous.spend > MIN_SPEND_FOR_VAR)
    .sort((a, b) => a.deltasW1.roas - b.deltasW1.roas)
    .slice(0, 3)
    .map(m => ({ label: m.key, roas: m.current.roas, delta: m.deltasW1.roas, type: 'ROAS' }));

  const anomalies = [];
  for (const m of reports) {
    if (m.current.clicks > (isCampaign ? 20 : 100) && m.deltasW1.conversions < -50 && Math.abs(m.deltasW1.clicks) < 20) {
      anomalies.push({
        market: m.key,
        reason: 'Chute brutale du taux de conversion malgré un trafic stable. Vérifier le tracking ou le site.',
        severity: 'high'
      });
    }
    if (m.deltasW1.spend > 50 && m.deltasW1.revenue < 10 && m.previous.spend > MIN_SPEND_FOR_VAR) {
      anomalies.push({
        market: m.key,
        reason: 'Augmentation forte du budget sans retour sur investissement proportionnel.',
        severity: 'medium'
      });
    }
  }

  return { tops, flops, anomalies };
}

export default router;
