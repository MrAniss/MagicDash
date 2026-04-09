import { Router } from 'express';
import { isAuthenticated } from '../auth.js';
import { getShoppingData } from '../googleAdsClient.js';
import { getPriceMap, getPriceCompetitivenessData } from '../services/merchantCenterClient.js';

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

export default router;
