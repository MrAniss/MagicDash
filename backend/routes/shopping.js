import { Router } from 'express';
import { isAuthenticated } from '../auth.js';
import { getShoppingData, getScoringData } from '../googleAdsClient.js';
import { getPriceMap, getPriceCompetitivenessData, getProductStatuses, getSalePriceMap } from '../services/merchantCenterClient.js';
import { POAS_BREAKEVEN } from '../config/poasThresholds.js';

const router = Router();

function r2(v) { return Math.round(v * 100) / 100; }

function subDays(dateStr, n) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function getCompDates(from, to, compareTo) {
  const f = new Date(from);
  const t = new Date(to);
  const days = Math.round((t - f) / 86400000) + 1;
  if (compareTo === 'previous_year') {
    const pf = new Date(f); pf.setFullYear(pf.getFullYear() - 1);
    const pt = new Date(t); pt.setFullYear(pt.getFullYear() - 1);
    return { compFrom: pf.toISOString().slice(0, 10), compTo: pt.toISOString().slice(0, 10) };
  }
  const compTo = subDays(from, 1);
  const compFrom = subDays(compTo, days - 1);
  return { compFrom, compTo };
}

// ─── Aggregation helpers ──────────────────────────────────

function getProductSegment({ impressions, clicks, cvr, roas, revenue, cost }) {
  if (impressions === 0)                        return 'ZOMBIE';
  if (clicks > 50 && cvr < 1)                   return 'TRAFIC_SANS_CONV';
  if (roas > 5 && revenue > 500)                 return 'TOP';
  if (roas < 2 && cost > 50)                     return 'SOUS_PERF';
  return 'STANDARD';
}

function aggregateProducts(rows) {
  const byId = {};
  for (const row of rows) {
    if (!row.item_id) continue;
    const key = `${row.brand}||${row.market}||${row.item_id}`;
    if (!byId[key]) {
      byId[key] = {
        item_id: row.item_id, title: row.title, product_brand: row.product_brand,
        category_l1: row.category_l1, market: row.market, brand: row.brand, brandLabel: row.brandLabel,
        impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0,
      };
    }
    const p = byId[key];
    p.impressions += row.impressions;
    p.clicks      += row.clicks;
    p.cost        += row.cost;
    p.conversions += row.conversions;
    p.revenue     += row.revenue;
    // Always keep the best (non-empty) title and brand
    if (!p.title        && row.title)        p.title        = row.title;
    if (!p.product_brand && row.product_brand) p.product_brand = row.product_brand;
  }
  return Object.values(byId).map(p => {
    const cost    = r2(p.cost);
    const revenue = r2(p.revenue);
    const roas    = cost > 0 ? r2(revenue / cost) : 0;
    const cvr     = p.clicks > 0 ? r2((p.conversions / p.clicks) * 100) : 0;
    const ctr     = p.impressions > 0 ? r2((p.clicks / p.impressions) * 100) : 0;
    const avg_price = p.conversions > 0 ? r2(p.revenue / p.conversions) : null;
    return {
      ...p, cost, revenue, roas, cvr, ctr, avg_price,
      segment: getProductSegment({ impressions: p.impressions, clicks: p.clicks, cvr, roas, revenue, cost }),
    };
  });
}

function aggregateBrands(products, pcMap = {}) {
  const byBrand = {};
  for (const p of products) {
    const key = p.product_brand || '(Sans marque)';
    if (!byBrand[key]) {
      byBrand[key] = {
        product_brand: key,
        impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, product_count: 0,
        _delta_sum: 0, _delta_count: 0,
      };
    }
    const b = byBrand[key];
    b.impressions += p.impressions;
    b.clicks      += p.clicks;
    b.cost        += p.cost;
    b.conversions += p.conversions;
    b.revenue     += p.revenue;
    b.product_count++;
    // Accumulate delta_pct for avg computation
    const pc = pcMap[p.item_id];
    if (pc?.delta_pct != null) {
      b._delta_sum += pc.delta_pct;
      b._delta_count++;
    }
  }
  return Object.values(byBrand).map(b => {
    const { _delta_sum, _delta_count, ...rest } = b;
    return {
      ...rest,
      cost:          r2(b.cost),
      revenue:       r2(b.revenue),
      roas:          b.cost > 0 ? r2(b.revenue / b.cost) : 0,
      cvr:           b.clicks > 0 ? r2((b.conversions / b.clicks) * 100) : 0,
      ctr:           b.impressions > 0 ? r2((b.clicks / b.impressions) * 100) : 0,
      aov:           b.conversions > 0 ? r2(b.revenue / b.conversions) : null,
      avg_delta_pct: _delta_count > 0 ? r2(_delta_sum / _delta_count) : null,
    };
  });
}

function getSortKey(sort) {
  const allowed = ['revenue', 'roas', 'impressions', 'clicks', 'cost', 'cvr', 'ctr', 'conversions', 'avg_price', 'price', 'delta_pct', 'benchmark_price'];
  return allowed.includes(sort) ? sort : 'revenue';
}

// Enrich products with price map + competitiveness data
function enrichProducts(products, priceMap, pcMap) {
  return products.map(p => {
    const pm = priceMap[p.item_id];
    const pc = pcMap[p.item_id] || null;
    return {
      ...p,
      price:            pm?.price ?? null,
      price_currency:   pm?.currency ?? null,
      benchmark_price:  pc?.benchmark_price ?? null,
      delta_pct:        pc?.delta_pct ?? null,
      delta_eur:        pc?.delta_eur ?? null,
      price_status:     pc?.status ?? 'NO_DATA',
    };
  });
}

// ─── GET /api/shopping/products ──────────────────────────
router.get('/products', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const {
      brand = 'ALL', market = 'ALL', from, to,
      limit = '100', offset = '0',
      sort = 'revenue', order = 'desc',
      segment = 'ALL', product_brand = 'ALL', search = '',
      price_status = 'ALL',
    } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const [rows, priceMap, pcMap] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getPriceMap(brand, market),
      getPriceCompetitivenessData(brand, market),
    ]);
    const products = enrichProducts(aggregateProducts(rows), priceMap, pcMap);

    // — Totals (before filtering) —
    const totalRevenue = r2(products.reduce((s, p) => s + p.revenue, 0));
    const totalCost    = r2(products.reduce((s, p) => s + p.cost, 0));
    const totalConv    = products.reduce((s, p) => s + p.conversions, 0);
    const totalClicks  = products.reduce((s, p) => s + p.clicks, 0);
    const activeCount  = products.filter(p => p.impressions > 0).length;
    const avgRoas      = totalCost > 0 ? r2(totalRevenue / totalCost) : 0;
    const avgCvr       = totalClicks > 0 ? r2((totalConv / totalClicks) * 100) : 0;

    // — Segment counts & revenue share —
    const segCounts = {}, segRevenue = {};
    for (const p of products) {
      segCounts[p.segment]  = (segCounts[p.segment]  || 0) + 1;
      segRevenue[p.segment] = (segRevenue[p.segment] || 0) + p.revenue;
    }

    // — Filter —
    let filtered = products;
    if (segment !== 'ALL')       filtered = filtered.filter(p => p.segment === segment);
    if (product_brand !== 'ALL') filtered = filtered.filter(p => p.product_brand === product_brand);
    if (price_status !== 'ALL')  filtered = filtered.filter(p => p.price_status === price_status);
    if (search) {
      const q = search.toLowerCase();
      filtered = filtered.filter(p =>
        (p.title || '').toLowerCase().includes(q) || p.item_id.toLowerCase().includes(q)
      );
    }

    // — Sort —
    const sortKey = getSortKey(sort);
    const dir = order === 'asc' ? 1 : -1;
    filtered.sort((a, b) => dir * ((a[sortKey] ?? -Infinity) - (b[sortKey] ?? -Infinity)));

    // — Paginate —
    const lim = Math.min(Number(limit), 500);
    const off = Number(offset) || 0;

    res.json({
      summary: {
        total: products.length, active: activeCount,
        revenue: totalRevenue, cost: totalCost,
        conversions: totalConv, avg_roas: avgRoas, avg_cvr: avgCvr,
      },
      segments: segCounts,
      segment_revenue: segRevenue,
      total_filtered: filtered.length,
      products: filtered.slice(off, off + lim),
    });
  } catch (err) {
    console.error('Shopping/products:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/brands ─────────────────────────────
router.get('/brands', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL', from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const [rows, pcMap] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getPriceCompetitivenessData(brand, market),
    ]);
    const products = aggregateProducts(rows);
    const brands = aggregateBrands(products, pcMap);
    brands.sort((a, b) => b.revenue - a.revenue);
    res.json(brands);
  } catch (err) {
    console.error('Shopping/brands:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/price-summary ─────────────────────
router.get('/price-summary', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL', from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const [rows, pcMap] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getPriceCompetitivenessData(brand, market),
    ]);
    const products = aggregateProducts(rows).filter(p => p.impressions > 0);

    const counts = { COMPETITIVE: 0, ON_PAR: 0, EXPENSIVE: 0, NO_DATA: 0 };
    const expensiveProducts = [];

    for (const p of products) {
      const pc = pcMap[p.item_id];
      if (!pc) { counts.NO_DATA++; continue; }
      counts[pc.status] = (counts[pc.status] || 0) + 1;
      if (pc.status === 'EXPENSIVE' && p.revenue > 0) {
        expensiveProducts.push({
          item_id: p.item_id, title: p.title, product_brand: p.product_brand,
          our_price: pc.our_price, benchmark_price: pc.benchmark_price,
          delta_pct: pc.delta_pct, revenue: p.revenue,
        });
      }
    }

    // Top 10 most expensive vs market (sorted by delta_pct desc)
    expensiveProducts.sort((a, b) => b.delta_pct - a.delta_pct);
    const insights = expensiveProducts.slice(0, 10);

    const total = products.length;
    res.json({
      total,
      counts,
      pct: {
        COMPETITIVE: total > 0 ? r2((counts.COMPETITIVE / total) * 100) : 0,
        ON_PAR:      total > 0 ? r2((counts.ON_PAR      / total) * 100) : 0,
        EXPENSIVE:   total > 0 ? r2((counts.EXPENSIVE   / total) * 100) : 0,
        NO_DATA:     total > 0 ? r2((counts.NO_DATA     / total) * 100) : 0,
      },
      insights,
    });
  } catch (err) {
    console.error('Shopping/price-summary:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/comparison ────────────────────────
router.get('/comparison', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const { compFrom, compTo } = getCompDates(from, to, compareTo);
    const [currRows, prevRows] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getShoppingData(brand, market, compFrom, compTo),
    ]);

    const curr = aggregateProducts(currRows);
    const prev = aggregateProducts(prevRows);

    const prevMap = {};
    for (const p of prev) prevMap[`${p.brand}||${p.market}||${p.item_id}`] = p;

    const result = curr.map(p => {
      const key = `${p.brand}||${p.market}||${p.item_id}`;
      const q = prevMap[key] || null;
      return {
        item_id: p.item_id, title: p.title, product_brand: p.product_brand,
        market: p.market, brand: p.brand, brandLabel: p.brandLabel,
        current:  { revenue: p.revenue, roas: p.roas, cvr: p.cvr, cost: p.cost, clicks: p.clicks, conversions: p.conversions },
        previous: q ? { revenue: q.revenue, roas: q.roas, cvr: q.cvr, cost: q.cost, clicks: q.clicks, conversions: q.conversions } : null,
        delta_revenue: q && q.revenue > 0 ? r2(((p.revenue - q.revenue) / q.revenue) * 100) : null,
        delta_roas:    q ? r2(p.roas - q.roas) : null,
        delta_cvr:     q ? r2(p.cvr  - q.cvr)  : null,
        trend: q ? (p.revenue >= q.revenue ? 'UP' : 'DOWN') : 'NEW',
      };
    });

    // Add products that disappeared
    const currKeys = new Set(curr.map(p => `${p.brand}||${p.market}||${p.item_id}`));
    for (const p of prev) {
      if (!currKeys.has(`${p.brand}||${p.market}||${p.item_id}`)) {
        result.push({
          item_id: p.item_id, title: p.title, product_brand: p.product_brand,
          market: p.market, brand: p.brand, brandLabel: p.brandLabel,
          current: null,
          previous: { revenue: p.revenue, roas: p.roas, cvr: p.cvr, cost: p.cost, clicks: p.clicks, conversions: p.conversions },
          delta_revenue: null, delta_roas: null, delta_cvr: null,
          trend: 'GONE',
        });
      }
    }

    result.sort((a, b) => (b.current?.revenue || 0) - (a.current?.revenue || 0));
    res.json(result.slice(0, 500));
  } catch (err) {
    console.error('Shopping/comparison:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/grouped ────────────────────────────
// groupBy = 'brand' | 'category'
router.get('/grouped', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL', from, to, groupBy = 'brand' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const [rows, pcMap] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getPriceCompetitivenessData(brand, market),
    ]);
    const products = aggregateProducts(rows);

    const keyFn = groupBy === 'category'
      ? p => p.category_l1 || '(Sans catégorie)'
      : p => p.product_brand || '(Sans marque)';

    const map = new Map();
    for (const p of products) {
      const key = keyFn(p);
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          impressions: 0, clicks: 0, cost: 0, conversions: 0, revenue: 0, product_count: 0,
          pc: { COMPETITIVE: 0, ON_PAR: 0, EXPENSIVE: 0, NO_DATA: 0 },
        });
      }
      const g = map.get(key);
      g.impressions    += p.impressions;
      g.clicks         += p.clicks;
      g.cost           += p.cost;
      g.conversions    += p.conversions;
      g.revenue        += p.revenue;
      g.product_count++;
      const status = pcMap[p.item_id]?.status ?? 'NO_DATA';
      g.pc[status] = (g.pc[status] || 0) + 1;
    }

    const result = Array.from(map.values()).map(g => {
      const pcTotal = g.pc.COMPETITIVE + g.pc.ON_PAR + g.pc.EXPENSIVE;
      return {
        name:          g.name,
        product_count: g.product_count,
        impressions:   g.impressions,
        clicks:        g.clicks,
        cost:          r2(g.cost),
        conversions:   g.conversions,
        revenue:       r2(g.revenue),
        roas:          g.cost > 0 ? r2(g.revenue / g.cost) : 0,
        cvr:           g.clicks > 0 ? r2((g.conversions / g.clicks) * 100) : 0,
        ctr:           g.impressions > 0 ? r2((g.clicks / g.impressions) * 100) : 0,
        aov:           g.conversions > 0 ? r2(g.revenue / g.conversions) : null,
        price_breakdown: {
          competitive:     g.pc.COMPETITIVE,
          on_par:          g.pc.ON_PAR,
          expensive:       g.pc.EXPENSIVE,
          no_data:         g.pc.NO_DATA,
          total_with_data: pcTotal,
          competitive_pct: pcTotal > 0 ? r2((g.pc.COMPETITIVE / pcTotal) * 100) : 0,
          on_par_pct:      pcTotal > 0 ? r2((g.pc.ON_PAR      / pcTotal) * 100) : 0,
          expensive_pct:   pcTotal > 0 ? r2((g.pc.EXPENSIVE   / pcTotal) * 100) : 0,
        },
      };
    });

    result.sort((a, b) => b.impressions - a.impressions);
    res.json(result);
  } catch (err) {
    console.error('Shopping/grouped:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/zombies ────────────────────────────
// Products active in past 90d but with 0 impressions in requested period
router.get('/zombies', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL', from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const ref90From = subDays(from, 90);
    const [recentRows, refRows] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getShoppingData(brand, market, ref90From, to),
    ]);

    const recentProducts = aggregateProducts(recentRows);
    const refProducts    = aggregateProducts(refRows);

    const activeKeys = new Set(
      recentProducts.filter(p => p.impressions > 0).map(p => `${p.brand}||${p.market}||${p.item_id}`)
    );

    const zombies = refProducts
      .filter(p => !activeKeys.has(`${p.brand}||${p.market}||${p.item_id}`))
      .map(p => ({
        item_id: p.item_id, title: p.title,
        brand: p.product_brand, market: p.market, brandLabel: p.brandLabel,
      }));

    res.json(zombies.slice(0, 500));
  } catch (err) {
    console.error('Shopping/zombies:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/scoring ────────────────────────────
// CC FR only — hardcoded to customer 432-928-8276

const SCORING_BUCKETS = {
  'TOP':    { label: 'Top',       color: '#00B87A', order: 1 },
  'MIDDLE': { label: 'Middle',    color: '#F5A623', order: 2 },
  'FLOP':   { label: 'Flop',      color: '#E8524A', order: 3 },
  'ZOMBIE': { label: 'Zombie',    color: '#8896B0', order: 4 },
  '':       { label: 'Non scoré', color: '#D1D5DB', order: 5 },
};

router.get('/scoring', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const rows = await getScoringData(from, to);

    // Aggregate by scoring bucket
    const agg = {};
    for (const [key] of Object.entries(SCORING_BUCKETS)) {
      agg[key] = { cost: 0, revenue: 0, impressions: 0, clicks: 0, conversions: 0, items: new Set() };
    }

    for (const row of rows) {
      const key = row.scoring in SCORING_BUCKETS ? row.scoring : '';
      agg[key].cost        += row.cost;
      agg[key].revenue     += row.revenue;
      agg[key].impressions += row.impressions;
      agg[key].clicks      += row.clicks;
      agg[key].conversions += row.conversions;
      if (row.item_id) agg[key].items.add(row.item_id);
    }

    const totalSpend   = Object.values(agg).reduce((s, v) => s + v.cost, 0);
    const totalRevenue = Object.values(agg).reduce((s, v) => s + v.revenue, 0);
    const breakeven    = POAS_BREAKEVEN['Cocooncenter']['FR'];

    const result = Object.entries(SCORING_BUCKETS)
      .map(([key, meta]) => {
        const d = agg[key];
        const roas = d.cost > 0 ? r2(d.revenue / d.cost) : 0;
        const cvr  = d.clicks > 0 ? r2((d.conversions / d.clicks) * 100) : 0;
        return {
          scoring:       key || 'NON_SCORE',
          label:         meta.label,
          color:         meta.color,
          product_count: d.items.size,
          spend:         r2(d.cost),
          revenue:       r2(d.revenue),
          conversions:   r2(d.conversions),
          impressions:   d.impressions,
          clicks:        d.clicks,
          roas,
          cvr,
          spend_pct:   totalSpend   > 0 ? r2((d.cost    / totalSpend)   * 100) : 0,
          revenue_pct: totalRevenue > 0 ? r2((d.revenue / totalRevenue) * 100) : 0,
          breakeven,
        };
      })
      .filter(b => b.spend > 0 || b.revenue > 0 || b.impressions > 0);

    result.sort((a, b) => {
      const keyA = a.scoring === 'NON_SCORE' ? '' : a.scoring;
      const keyB = b.scoring === 'NON_SCORE' ? '' : b.scoring;
      return (SCORING_BUCKETS[keyA]?.order ?? 99) - (SCORING_BUCKETS[keyB]?.order ?? 99);
    });

    res.json(result);
  } catch (err) {
    console.error('Shopping/scoring:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/product-status-summary ────────────
// Scorecards statut produits (actifs / refusés / limités / en attente / total)
router.get('/product-status-summary', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL' } = req.query;
    const items = await getProductStatuses(brand, market);
    const counts = { active: 0, disapproved: 0, limited: 0, pending: 0 };
    for (const it of items) {
      if (counts[it.status] != null) counts[it.status]++;
      else counts.pending++;
    }
    const total = items.length;
    res.json({ ...counts, total });
  } catch (err) {
    console.error('Shopping/product-status-summary:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/brands-detail ─────────────────────
// Tableau top marques (accordéon section 3)
router.get('/brands-detail', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL', from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const [rows, pcMap] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getPriceCompetitivenessData(brand, market),
    ]);
    const products = aggregateProducts(rows);
    const brands = aggregateBrands(products, pcMap);
    brands.sort((a, b) => b.revenue - a.revenue);
    res.json(brands);
  } catch (err) {
    console.error('Shopping/brands-detail:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/products-by-brand ─────────────────
// Drill-down produits d'une marque (accordéon section 3)
router.get('/products-by-brand', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL', from, to, product_brand } = req.query;
    if (!from || !to)     return res.status(400).json({ error: 'Missing from/to' });
    if (!product_brand)   return res.status(400).json({ error: 'Missing product_brand' });

    const [rows, priceMap, pcMap] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getPriceMap(brand, market),
      getPriceCompetitivenessData(brand, market),
    ]);
    const products = enrichProducts(aggregateProducts(rows), priceMap, pcMap)
      .filter(p => (p.product_brand || '(Sans marque)') === product_brand);
    products.sort((a, b) => b.revenue - a.revenue);
    res.json(products.slice(0, 500));
  } catch (err) {
    console.error('Shopping/products-by-brand:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/top-flop ──────────────────────────
// Top & Flop produits/marques/catégories — trend vs période précédente
router.get('/top-flop', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const {
      brand = 'ALL', market = 'ALL', from, to,
      compareTo = 'previous_period',
      view = 'product',
      limit = '20',
    } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const { compFrom, compTo } = getCompDates(from, to, compareTo);
    const [currRows, prevRows] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getShoppingData(brand, market, compFrom, compTo),
    ]);

    // Aggregate both periods
    const curr = aggregateProducts(currRows);
    const prev = aggregateProducts(prevRows);

    // Group if needed
    function groupBy(products, keyFn, labelFn) {
      const map = new Map();
      for (const p of products) {
        const key = keyFn(p);
        if (!key) continue;
        if (!map.has(key)) {
          map.set(key, { key, label: labelFn(p, key), revenue: 0, cost: 0, conversions: 0, clicks: 0 });
        }
        const g = map.get(key);
        g.revenue     += p.revenue;
        g.cost        += p.cost;
        g.conversions += p.conversions;
        g.clicks      += p.clicks;
      }
      return Array.from(map.values()).map(g => ({
        key: g.key, label: g.label,
        revenue:     r2(g.revenue),
        cost:        r2(g.cost),
        conversions: g.conversions,
        clicks:      g.clicks,
        roas:        g.cost > 0 ? r2(g.revenue / g.cost) : 0,
        cvr:         g.clicks > 0 ? r2((g.conversions / g.clicks) * 100) : 0,
      }));
    }

    let currRows2, prevRows2;
    if (view === 'brand') {
      currRows2 = groupBy(curr, p => p.product_brand || '(Sans marque)', (_p, k) => k);
      prevRows2 = groupBy(prev, p => p.product_brand || '(Sans marque)', (_p, k) => k);
    } else if (view === 'category') {
      currRows2 = groupBy(curr, p => p.category_l1 || '(Sans catégorie)', (_p, k) => k);
      prevRows2 = groupBy(prev, p => p.category_l1 || '(Sans catégorie)', (_p, k) => k);
    } else {
      currRows2 = curr.map(p => ({
        key: p.item_id, label: p.title || p.item_id, item_id: p.item_id,
        product_brand: p.product_brand,
        revenue: p.revenue, cost: p.cost, conversions: p.conversions, clicks: p.clicks,
        roas: p.roas, cvr: p.cvr,
      }));
      prevRows2 = prev.map(p => ({
        key: p.item_id, label: p.title || p.item_id, item_id: p.item_id,
        product_brand: p.product_brand,
        revenue: p.revenue, cost: p.cost, conversions: p.conversions, clicks: p.clicks,
        roas: p.roas, cvr: p.cvr,
      }));
    }

    const prevMap = {};
    for (const p of prevRows2) prevMap[p.key] = p;

    const merged = currRows2.map(c => {
      const q = prevMap[c.key] || null;
      const delta_revenue = q && q.revenue > 0 ? r2(((c.revenue - q.revenue) / q.revenue) * 100) : null;
      const delta_roas    = q && q.roas    > 0 ? r2(((c.roas    - q.roas)    / q.roas)    * 100) : null;
      const delta_conv    = q && q.conversions > 0 ? r2(((c.conversions - q.conversions) / q.conversions) * 100) : null;
      return {
        label: c.label, key: c.key,
        item_id: c.item_id, product_brand: c.product_brand,
        current:  { revenue: c.revenue, roas: c.roas, cvr: c.cvr, conversions: c.conversions, cost: c.cost },
        previous: q ? { revenue: q.revenue, roas: q.roas, cvr: q.cvr, conversions: q.conversions, cost: q.cost } : null,
        delta_revenue, delta_roas, delta_conv,
      };
    });

    // Only keep rows where we have meaningful data in current period
    const meaningful = merged.filter(m => m.current.revenue > 0 || m.current.cost > 0);
    const withDelta  = meaningful.filter(m => m.delta_revenue != null);

    const lim = Math.min(Number(limit) || 20, 100);
    const top  = [...withDelta].sort((a, b) => (b.delta_revenue ?? -Infinity) - (a.delta_revenue ?? -Infinity)).slice(0, lim);
    const flop = [...withDelta].sort((a, b) => (a.delta_revenue ?? Infinity)  - (b.delta_revenue ?? Infinity)).slice(0, lim);

    res.json({ top, flop, period: { from, to }, compare: { from: compFrom, to: compTo } });
  } catch (err) {
    console.error('Shopping/top-flop:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/feed-quality ──────────────────────
// Qualité du flux Merchant Center (issues produits)
router.get('/feed-quality', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL' } = req.query;
    const items = await getProductStatuses(brand, market);

    const withIssues = items.filter(it => it.issues && it.issues.length > 0);

    const summary = { total_issues: 0, image: 0, description: 0, gtin: 0, category: 0, shipping: 0, price: 0, availability: 0, other: 0 };
    for (const it of withIssues) {
      for (const iss of it.issues) {
        summary.total_issues++;
        const k = iss.type.toLowerCase();
        if (summary[k] != null) summary[k]++;
        else summary.other++;
      }
    }

    res.json({
      summary,
      products: withIssues.slice(0, 500).map(it => ({
        item_id:  it.item_id,
        title:    it.title,
        brand:    it.brand,
        status:   it.status,
        severity: it.status,
        issues:   it.issues,
      })),
    });
  } catch (err) {
    console.error('Shopping/feed-quality:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/promos ────────────────────────────
// Produits avec sale_price actif (badge promo dans le flux)
router.get('/promos', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL' } = req.query;

    const [promoMap, pcMap] = await Promise.all([
      getSalePriceMap(brand, market),
      getPriceCompetitivenessData(brand, market),
    ]);

    const results = [];
    for (const [offerId, p] of Object.entries(promoMap)) {
      if (!p.original_price || !p.sale_price || p.sale_price >= p.original_price) continue;
      const discount_pct = r2(((p.sale_price - p.original_price) / p.original_price) * 100);
      const pc = pcMap[offerId] || null;
      const delta_vs_market = pc?.benchmark_price
        ? r2(((p.sale_price - pc.benchmark_price) / pc.benchmark_price) * 100)
        : null;
      const market_status = delta_vs_market == null
        ? 'NO_DATA'
        : delta_vs_market < -5 ? 'COMPETITIVE' : delta_vs_market > 5 ? 'EXPENSIVE' : 'ON_PAR';

      results.push({
        item_id:         offerId,
        title:           p.title,
        brand:           p.brand,
        original_price:  p.original_price,
        sale_price:      p.sale_price,
        discount_pct,
        benchmark_price: pc?.benchmark_price ?? null,
        delta_vs_market,
        market_status,
        promo_start:     p.promo_start,
        promo_end:       p.promo_end,
        currency:        p.currency,
      });
    }

    results.sort((a, b) => a.discount_pct - b.discount_pct); // most negative (biggest discount) first
    res.json(results);
  } catch (err) {
    console.error('Shopping/promos:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
