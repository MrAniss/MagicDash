import { Router } from 'express';
import { isAuthenticated } from '../auth.js';
import { getCompetitionData, getCompetitionTrendData } from '../googleAdsClient.js';

const router = Router();

function r3(v) { return v != null ? Math.round(v * 1000) / 1000 : null; }

function weightedAvg(rows, field) {
  const valid = rows.filter(r => r[field] != null && r.impressions > 0);
  if (!valid.length) return null;
  const totalI = valid.reduce((s, r) => s + r.impressions, 0);
  if (totalI === 0) return null;
  return valid.reduce((s, r) => s + r[field] * r.impressions, 0) / totalI;
}

function simpleAvg(items, field) {
  const v = items.filter(r => r[field] != null);
  if (!v.length) return null;
  return v.reduce((s, r) => s + r[field], 0) / v.length;
}

function getStatus(data) {
  if (data.lost_budget > 0.20 || data.lost_rank > 0.30) return 'RISQUÉ';
  if (data.impression_share != null && data.impression_share < 0.50) return 'RISQUÉ';
  if (data.lost_budget > 0.12 || data.lost_rank > 0.20) return 'TENDU';
  return 'SAIN';
}

function aggregateOwn(rows) {
  const byMkt = {};
  for (const r of rows) {
    if (!byMkt[r.market]) byMkt[r.market] = { rows: [], hasPMax: false };
    byMkt[r.market].rows.push(r);
    if (r.isPMax) byMkt[r.market].hasPMax = true;
  }
  const out = {};
  for (const [mkt, d] of Object.entries(byMkt)) {
    const is = r3(weightedAvg(d.rows, 'impression_share'));
    const cs = r3(weightedAvg(d.rows, 'click_share'));
    const lb = r3(weightedAvg(d.rows, 'lost_budget'));
    const lr = r3(weightedAvg(d.rows, 'lost_rank'));
    const at = r3(weightedAvg(d.rows, 'abs_top_share'));
    const ts = r3(weightedAvg(d.rows, 'top_share'));
    out[mkt] = {
      impression_share: is, click_share: cs,
      lost_budget: lb !== null ? lb : 0,
      lost_rank: lr !== null ? lr : 0,
      abs_top_share: at, top_share: ts,
      has_pmax: d.hasPMax,
      total_cost: Math.round(d.rows.reduce((s, r) => s + r.cost, 0) * 100) / 100,
    };
    out[mkt].status = getStatus(out[mkt]);
  }
  return out;
}

function aggregateInsights(rows) {
  const byMkt = {};
  for (const r of rows) {
    if (!r.domain) continue;
    if (!byMkt[r.market]) byMkt[r.market] = {};
    if (!byMkt[r.market][r.domain]) byMkt[r.market][r.domain] = [];
    byMkt[r.market][r.domain].push(r);
  }
  const out = {};
  for (const [mkt, domains] of Object.entries(byMkt)) {
    out[mkt] = Object.entries(domains)
      .map(([domain, vals]) => ({
        domain,
        impression_share: r3(simpleAvg(vals, 'impression_share')),
        overlap_rate:     r3(simpleAvg(vals, 'overlap_rate')),
        position_above:   r3(simpleAvg(vals, 'position_above')),
        top_share:        r3(simpleAvg(vals, 'top_share')),
        outranking_share: r3(simpleAvg(vals, 'outranking_share')),
      }))
      .filter(d => d.overlap_rate != null)
      .sort((a, b) => (b.overlap_rate || 0) - (a.overlap_rate || 0))
      .slice(0, 10); // top 10 per market
  }
  return out;
}

function absDeltaPt(curr, prev) {
  if (curr == null || prev == null) return null;
  return Math.round((curr - prev) * 1000) / 10; // in pp
}

function generateInsights(markets) {
  return markets
    .filter(m => m.status !== 'SAIN' || (m.competitors && m.competitors.length > 0))
    .map(m => {
      const msgs = [];

      if (m.impression_share != null && m.impression_share < 0.40) {
        msgs.push(`Part d'impressions critique (${Math.round(m.impression_share * 100)}%) — présence très limitée.`);
      }
      if (m.lost_budget != null && m.lost_rank != null) {
        if (m.lost_budget > m.lost_rank * 1.5 && m.lost_budget > 0.12) {
          msgs.push(`Pertes dues au budget (${Math.round(m.lost_budget * 100)}%) — envisager d'augmenter le budget journalier.`);
        } else if (m.lost_rank > m.lost_budget * 1.5 && m.lost_rank > 0.20) {
          msgs.push(`Pertes dues au classement (${Math.round(m.lost_rank * 100)}%) — revoir les enchères ou le tROAS.`);
        }
      }
      const top = m.competitors?.[0];
      if (top) {
        if (top.position_above != null && top.position_above > 0.40) {
          msgs.push(`${top.domain} te surclasse ${Math.round(top.position_above * 100)}% du temps — concurrent prioritaire.`);
        } else if (top.overlap_rate != null && top.overlap_rate > 0.55) {
          msgs.push(`${top.domain} est présent sur ${Math.round(top.overlap_rate * 100)}% de tes enchères.`);
        }
      }
      if (m.competitors?.length >= 3) {
        const combined = (m.competitors[0].overlap_rate || 0) + (m.competitors[1].overlap_rate || 0);
        if (combined > 1.2) {
          msgs.push(`${m.competitors[0].domain} et ${m.competitors[1].domain} couvrent ${Math.round(combined * 100)}% de tes enchères combinés.`);
        }
      }
      return { market: m.market, messages: msgs };
    })
    .filter(i => i.messages.length > 0);
}

// ─── GET /api/competition ───────────────────────────────
router.get('/', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'COCOONCENTER', market = 'ALL', from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    // Compute previous equivalent period
    const fromD = new Date(from), toD = new Date(to);
    const days = Math.round((toD - fromD) / 86400000) + 1;
    const prevTo = new Date(fromD); prevTo.setDate(prevTo.getDate() - 1);
    const prevFrom = new Date(prevTo); prevFrom.setDate(prevFrom.getDate() - days + 1);
    const fmt = d => d.toISOString().slice(0, 10);

    const [cur, prev] = await Promise.all([
      getCompetitionData(brand, from, to),
      getCompetitionData(brand, fmt(prevFrom), fmt(prevTo)),
    ]);

    const curOwn  = aggregateOwn(cur.own);
    const prevOwn = aggregateOwn(prev.own);
    const curInsights = aggregateInsights(cur.insights);

    let markets = Object.entries(curOwn).map(([mkt, data]) => {
      const p = prevOwn[mkt] || {};
      return {
        market: mkt,
        ...data,
        deltas: {
          impression_share: absDeltaPt(data.impression_share, p.impression_share),
          click_share:      absDeltaPt(data.click_share, p.click_share),
          lost_budget:      absDeltaPt(data.lost_budget, p.lost_budget),
          lost_rank:        absDeltaPt(data.lost_rank, p.lost_rank),
        },
        competitors: curInsights[mkt] || [],
      };
    });

    if (market !== 'ALL') markets = markets.filter(m => m.market === market);
    markets.sort((a, b) => (b.total_cost || 0) - (a.total_cost || 0));

    res.json({ markets, insights: generateInsights(markets) });
  } catch (err) {
    console.error('Competition error:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/competition/trend ─────────────────────────
router.get('/trend', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'COCOONCENTER', market = 'ALL', from, to, granularity = 'day' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const rows = await getCompetitionTrendData(brand, market, from, to);

    const byDate = {};
    for (const r of rows) {
      if (!r.date) continue;
      let key = r.date;
      if (granularity === 'week') {
        const d = new Date(r.date);
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
        key = d.toISOString().slice(0, 10);
      } else if (granularity === 'month') {
        key = r.date.slice(0, 7);
      }
      if (!byDate[key]) byDate[key] = [];
      byDate[key].push(r);
    }

    const trend = Object.entries(byDate)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, dayRows]) => {
        const is = weightedAvg(dayRows, 'impression_share');
        const lb = weightedAvg(dayRows, 'lost_budget');
        const lr = weightedAvg(dayRows, 'lost_rank');
        const ts = weightedAvg(dayRows, 'top_share');
        const toP = v => v != null ? Math.round(v * 1000) / 10 : null;
        return {
          date,
          impression_share: toP(is),
          lost_budget:      toP(lb),
          lost_rank:        toP(lr),
          top_share:        toP(ts),
          captured:         toP(is),
        };
      });

    res.json(trend);
  } catch (err) {
    console.error('Competition trend error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
