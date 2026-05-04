import { Router } from 'express';
import { isAuthenticated } from '../auth.js';
import { getShoppingData, getScoringData } from '../googleAdsClient.js';
import {
  getPriceMap,
  getPriceCompetitivenessData,
  getProductStatuses,
  getProductLinkMap,
} from '../services/merchantCenterClient.js';
import { POAS_BREAKEVEN } from '../config/poasThresholds.js';

import { getComparisonDates, r2, pctChange } from '../dateUtils.js';

const router = Router();

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
    const cost = r2(b.cost);
    const revenue = r2(b.revenue);
    return {
      ...rest,
      cost,
      revenue,
      roas:          cost > 0 ? r2(revenue / cost) : 0,
      cvr:           b.clicks > 0 ? r2((b.conversions / b.clicks) * 100) : 0,
      ctr:           b.impressions > 0 ? r2((b.clicks / b.impressions) * 100) : 0,
      cpc:           b.clicks > 0 ? r2(cost / b.clicks) : 0,
      aov:           b.conversions > 0 ? r2(revenue / b.conversions) : null,
      avg_delta_pct: _delta_count > 0 ? r2(_delta_sum / _delta_count) : null,
    };
  });
}

// Enrich products with price map + competitiveness data
function enrichProducts(products, priceMap, pcMap, linkMap = {}) {
  return products.map(p => {
    const pm = priceMap[p.item_id];
    const pc = pcMap[p.item_id] || null;
    // The PriceCompetitiveness snapshot is the price Google saw when computing
    // the benchmark — typically the *effective* price (sale price if active).
    // The catalog priceMap returns the *regular* feed price. When the two
    // diverge by more than 1 cent, we infer the product is on promo.
    const regular = pm?.price ?? null;
    const effective = pc?.our_price ?? regular;
    const on_promo = regular != null && pc?.our_price != null
      && Math.abs(regular - pc.our_price) > 0.01
      && pc.our_price < regular;
    return {
      ...p,
      // "Notre Prix" displays the effective (current) price — keeps the
      // Notre Prix / Marché / Δ% triangle internally consistent.
      price:            effective,
      regular_price:    regular,
      price_currency:   pm?.currency ?? null,
      on_promo,
      link:             linkMap[p.item_id] ?? null,
      benchmark_price:  pc?.benchmark_price ?? null,
      delta_pct:        pc?.delta_pct ?? null,
      delta_eur:        pc?.delta_eur ?? null,
      price_status:     pc?.status ?? 'NO_DATA',
    };
  });
}

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

    const counts  = { COMPETITIVE: 0, ON_PAR: 0, EXPENSIVE: 0, NO_DATA: 0 };
    const cost    = { COMPETITIVE: 0, ON_PAR: 0, EXPENSIVE: 0, NO_DATA: 0 };
    const revenue = { COMPETITIVE: 0, ON_PAR: 0, EXPENSIVE: 0, NO_DATA: 0 };
    const expensiveProducts = [];

    for (const p of products) {
      const pc = pcMap[p.item_id];
      const status = pc?.status || 'NO_DATA';
      counts[status]  = (counts[status]  || 0) + 1;
      cost[status]    = (cost[status]    || 0) + (p.cost    || 0);
      revenue[status] = (revenue[status] || 0) + (p.revenue || 0);
      if (pc && pc.status === 'EXPENSIVE' && p.revenue > 0) {
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
    const totalCost    = cost.COMPETITIVE    + cost.ON_PAR    + cost.EXPENSIVE    + cost.NO_DATA;
    const totalRevenue = revenue.COMPETITIVE + revenue.ON_PAR + revenue.EXPENSIVE + revenue.NO_DATA;
    const roasOf = (k) => cost[k] > 0 ? r2(revenue[k] / cost[k]) : 0;
    res.json({
      total,
      counts,
      cost: {
        COMPETITIVE: r2(cost.COMPETITIVE),
        ON_PAR:      r2(cost.ON_PAR),
        EXPENSIVE:   r2(cost.EXPENSIVE),
        NO_DATA:     r2(cost.NO_DATA),
      },
      revenue: {
        COMPETITIVE: r2(revenue.COMPETITIVE),
        ON_PAR:      r2(revenue.ON_PAR),
        EXPENSIVE:   r2(revenue.EXPENSIVE),
        NO_DATA:     r2(revenue.NO_DATA),
      },
      roas: {
        COMPETITIVE: roasOf('COMPETITIVE'),
        ON_PAR:      roasOf('ON_PAR'),
        EXPENSIVE:   roasOf('EXPENSIVE'),
        NO_DATA:     roasOf('NO_DATA'),
      },
      pct: {
        COMPETITIVE: total > 0 ? r2((counts.COMPETITIVE / total) * 100) : 0,
        ON_PAR:      total > 0 ? r2((counts.ON_PAR      / total) * 100) : 0,
        EXPENSIVE:   total > 0 ? r2((counts.EXPENSIVE   / total) * 100) : 0,
        NO_DATA:     total > 0 ? r2((counts.NO_DATA     / total) * 100) : 0,
      },
      cost_pct: {
        COMPETITIVE: totalCost > 0 ? r2((cost.COMPETITIVE / totalCost) * 100) : 0,
        ON_PAR:      totalCost > 0 ? r2((cost.ON_PAR      / totalCost) * 100) : 0,
        EXPENSIVE:   totalCost > 0 ? r2((cost.EXPENSIVE   / totalCost) * 100) : 0,
        NO_DATA:     totalCost > 0 ? r2((cost.NO_DATA     / totalCost) * 100) : 0,
      },
      revenue_pct: {
        COMPETITIVE: totalRevenue > 0 ? r2((revenue.COMPETITIVE / totalRevenue) * 100) : 0,
        ON_PAR:      totalRevenue > 0 ? r2((revenue.ON_PAR      / totalRevenue) * 100) : 0,
        EXPENSIVE:   totalRevenue > 0 ? r2((revenue.EXPENSIVE   / totalRevenue) * 100) : 0,
        NO_DATA:     totalRevenue > 0 ? r2((revenue.NO_DATA     / totalRevenue) * 100) : 0,
      },
      total_cost:    r2(totalCost),
      total_revenue: r2(totalRevenue),
      total_roas:    totalCost > 0 ? r2(totalRevenue / totalCost) : 0,
      insights,
    });
  } catch (err) {
    console.error('Shopping/price-summary:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/scoring ────────────────────────────
// CC FR only — resolves the customer ID via BRANDS.COCOONCENTER (env-driven).

const SCORING_BUCKETS = {
  'TOP_MIDDLE': { label: 'Top/Middle', color: '#00B87A', order: 1 },
  'FLOP':       { label: 'Flop',       color: '#E8524A', order: 3 },
  'ZOMBIE':     { label: 'Zombie',     color: '#8896B0', order: 4 },
  '':           { label: 'Non scoré',  color: '#D1D5DB', order: 5 },
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
      agg[key] = { cost: 0, revenue: 0, margin: 0, impressions: 0, clicks: 0, conversions: 0, items: new Set() };
    }

    for (const row of rows) {
      const key = row.scoring in SCORING_BUCKETS ? row.scoring : '';
      agg[key].cost        += row.cost;
      agg[key].revenue     += row.revenue;
      agg[key].margin      += (row.margin || 0);
      agg[key].impressions += row.impressions;
      agg[key].clicks      += row.clicks;
      agg[key].conversions += row.conversions;
      if (row.item_id) agg[key].items.add(row.item_id);
    }

    const totalSpend   = Object.values(agg).reduce((s, v) => s + v.cost, 0);
    const totalRevenue = Object.values(agg).reduce((s, v) => s + v.revenue, 0);
    const breakeven    = POAS_BREAKEVEN['COCOONCENTER']['FR'];

    const result = Object.entries(SCORING_BUCKETS)
      .map(([key, meta]) => {
        const d = agg[key];
        const poas = d.cost > 0 ? r2(d.margin / d.cost) : 0;
        const roas = d.cost > 0 ? r2(d.revenue / d.cost) : 0;
        const cvr  = d.clicks > 0 ? r2((d.conversions / d.clicks) * 100) : 0;
        return {
          scoring:       key || 'NON_SCORE',
          label:         meta.label,
          color:         meta.color,
          product_count: d.items.size,
          spend:         r2(d.cost),
          revenue:       r2(d.revenue),
          margin:        r2(d.margin),
          conversions:   r2(d.conversions),
          impressions:   d.impressions,
          clicks:        d.clicks,
          poas,
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

// ─── GET /api/shopping/brands-detail ─────────────────────
// Tableau top marques (accordéon section 3)
router.get('/brands-detail', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL', from, to, compareTo = 'previous_period' } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'Missing from/to' });

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);

    const [currRows, prevRows, pcMap] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getShoppingData(brand, market, compFrom, compTo),
      getPriceCompetitivenessData(brand, market),
    ]);

    const currBrands = aggregateBrands(aggregateProducts(currRows), pcMap);
    const prevBrands = aggregateBrands(aggregateProducts(prevRows), pcMap);

    const prevByKey = {};
    for (const b of prevBrands) prevByKey[b.product_brand] = b;

    const merged = currBrands.map(c => {
      const p = prevByKey[c.product_brand] || {};
      return {
        ...c,
        delta_impressions: pctChange(c.impressions, p.impressions || 0),
        delta_clicks:      pctChange(c.clicks,      p.clicks      || 0),
        delta_ctr:         pctChange(c.ctr,         p.ctr         || 0),
        delta_cpc:         pctChange(c.cpc,         p.cpc         || 0),
        delta_cost:        pctChange(c.cost,        p.cost        || 0),
        delta_conversions: pctChange(c.conversions, p.conversions || 0),
        delta_revenue:     pctChange(c.revenue,     p.revenue     || 0),
        delta_cvr:         pctChange(c.cvr,         p.cvr         || 0),
        delta_roas:        pctChange(c.roas,        p.roas        || 0),
      };
    });

    merged.sort((a, b) => b.revenue - a.revenue);
    res.json(merged);
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

    // linkMap can be slow on the very first cold fetch (products.list paginates
    // across all sub-accounts). Soft 5s timeout — if the cache is cold, return
    // products without URLs and let the warmer populate the cache in the
    // background for the next request.
    const linkMapWithTimeout = Promise.race([
      getProductLinkMap(brand, market),
      new Promise(resolve => setTimeout(() => resolve({}), 5000)),
    ]).catch(() => ({}));

    const [rows, priceMap, pcMap, linkMap] = await Promise.all([
      getShoppingData(brand, market, from, to),
      getPriceMap(brand, market),
      getPriceCompetitivenessData(brand, market),
      linkMapWithTimeout,
    ]);
    const products = enrichProducts(aggregateProducts(rows), priceMap, pcMap, linkMap)
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

    const { compFrom, compTo } = getComparisonDates(from, to, compareTo);
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
      const prevRevenue = q?.revenue || 0;
      const prevCost    = q?.cost    || 0;
      const delta_revenue_eur = q ? r2(c.revenue - prevRevenue) : null;
      const delta_revenue = q && prevRevenue > 0 ? r2(((c.revenue - prevRevenue) / prevRevenue) * 100) : null;
      const delta_cost    = q && prevCost    > 0 ? r2(((c.cost    - prevCost)    / prevCost)    * 100) : null;
      const delta_roas    = q && q.roas    > 0 ? r2(((c.roas    - q.roas)    / q.roas)    * 100) : null;
      const delta_conv    = q && q.conversions > 0 ? r2(((c.conversions - q.conversions) / q.conversions) * 100) : null;
      return {
        label: c.label, key: c.key,
        item_id: c.item_id, product_brand: c.product_brand,
        current:  { revenue: c.revenue, roas: c.roas, cvr: c.cvr, conversions: c.conversions, cost: c.cost },
        previous: q ? { revenue: q.revenue, roas: q.roas, cvr: q.cvr, conversions: q.conversions, cost: q.cost } : null,
        delta_revenue, delta_revenue_eur, delta_cost, delta_roas, delta_conv,
      };
    });

    // Soft floor: keep only rows with meaningful € volume on at least one period
    // (kills the +900% / -100% noise from products doing 5€ → 50€).
    const MIN_REVENUE = 100;
    const meaningful = merged.filter(m =>
      Math.max(m.current.revenue || 0, m.previous?.revenue || 0) >= MIN_REVENUE
    );
    const withDelta  = meaningful.filter(m => m.delta_revenue_eur != null);

    const lim = Math.min(Number(limit) || 20, 100);
    // Rank by ABSOLUTE delta (€) — surfaces real movements, not relative noise
    const top  = [...withDelta].sort((a, b) => (b.delta_revenue_eur ?? -Infinity) - (a.delta_revenue_eur ?? -Infinity)).slice(0, lim);
    const flop = [...withDelta].sort((a, b) => (a.delta_revenue_eur ?? Infinity)  - (b.delta_revenue_eur ?? Infinity)).slice(0, lim);

    res.json({ top, flop, period: { from, to }, compare: { from: compFrom, to: compTo } });
  } catch (err) {
    console.error('Shopping/top-flop:', err.message);
    if (err.message === 'NOT_AUTHENTICATED') return res.status(401).json({ error: 'Not authenticated' });
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/shopping/feed-quality ──────────────────────
// Liste des produits REFUSÉS par Merchant Center, avec les raisons exactes
// (description, détail, lien doc) telles que MC les expose, et non plus une
// classification générique côté serveur.
router.get('/feed-quality', async (req, res) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const { brand = 'ALL', market = 'ALL' } = req.query;
    const items = await getProductStatuses(brand, market);

    // Refusés uniquement — produits non diffusés sur Shopping
    const disapproved = items.filter(it => it.status === 'disapproved');

    // Compteurs par code MC réel (le champ `code` est stable, en anglais, ex.
    // "image_link_broken"). Permet à l'UI d'afficher des chips de regroupement
    // qui correspondent à ce qu'on voit dans Merchant Center.
    const byCode = {};
    for (const it of disapproved) {
      for (const iss of it.issues) {
        if (iss.severity !== 'disapproved') continue;
        const k = iss.code || 'unknown';
        if (!byCode[k]) byCode[k] = { code: k, description: iss.description, count: 0 };
        byCode[k].count++;
      }
    }
    const reasonSummary = Object.values(byCode).sort((a, b) => b.count - a.count);

    res.json({
      total_disapproved: disapproved.length,
      reason_summary:    reasonSummary,
      products: disapproved.slice(0, 1000).map(it => ({
        item_id: it.item_id,
        title:   it.title,
        brand:   it.brand,
        // Chaque raison = exactement ce que MC expose dans son UI
        issues:  it.issues
          .filter(iss => iss.severity === 'disapproved')
          .map(iss => ({
            code:          iss.code,
            description:   iss.description,
            detail:        iss.detail,
            documentation: iss.documentation,
            attribute:     iss.attribute,
            resolution:    iss.resolution,
          })),
      })),
    });
  } catch (err) {
    console.error('Shopping/feed-quality:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
