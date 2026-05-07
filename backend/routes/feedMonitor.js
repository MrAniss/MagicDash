import { Router } from 'express';
import db from '../database/db.js';
import { isAuthenticated } from '../auth.js';
import {
  runSnapshot, runAllSnapshots, isSnapshotRunning, getRunningSnapshots,
  FEED_BRANDS, FEED_TARGETS,
  loadCurrentSnapshotMap, computeDiffs,
} from '../services/feedSnapshotService.js';
import { MONITORED_ATTRIBUTES, attributeLabel, ALL_ATTRIBUTES } from '../config/monitoredAttributes.js';

const router = Router();

// Gate all feed-monitor routes behind Google OAuth (consistent with the rest of the API).
router.use((req, res, next) => {
  if (!isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  next();
});

// Brand normalization — accepts either 'BRAND_A' or 'Brand Alpha'.
function normBrand(b) {
  if (!b) return null;
  const upper = String(b).toUpperCase().replace(/[\s-]+/g, '_');
  if (upper === 'BRAND_ALPHA' || upper === 'BRAND_A') return 'BRAND_A';
  if (upper === 'BRAND_BETA'  || upper === 'BRAND_B') return 'BRAND_B';
  if (upper === 'BRAND_GAMMA' || upper === 'BRAND_C') return 'BRAND_C';
  if (upper === 'BRAND_DELTA' || upper === 'BRAND_D') return 'BRAND_D';
  return FEED_BRANDS.includes(upper) ? upper : null;
}

// ─── POST /api/feed-monitor/run ────────────────────────────
router.post('/run', async (req, res) => {
  try {
    const brand  = normBrand(req.body?.brand || req.query?.brand);
    const market = String(req.body?.market || req.query?.market || 'FR').toUpperCase();
    if (!brand) return res.status(400).json({ error: 'Invalid brand' });
    if (isSnapshotRunning(brand, market)) {
      return res.status(409).json({ error: 'Snapshot already running for this brand/market', running: true });
    }
    const result = await runSnapshot(brand, market, 'manual');
    res.json({ ok: true, ...result });
  } catch (e) {
    console.error('Feed Monitor run error:', e?.message);
    res.status(500).json({ error: e?.message || 'Failed to run snapshot' });
  }
});

// Status endpoint — used by the frontend to detect in-flight snapshots.
router.get('/status', (_req, res) => {
  res.json({ running: getRunningSnapshots(), targets: FEED_TARGETS });
});

// Fire-and-forget bulk run for every brand × market in FEED_TARGETS.
// Returns immediately because the run can take 30-60 minutes for the full
// Brand A set. Progress can be tracked via /status and /summary.
let bulkRunInFlight = false;
router.post('/run-all', (req, res) => {
  if (bulkRunInFlight) {
    return res.status(409).json({ error: 'Bulk run already in progress', running: true });
  }
  // skipRecent=true → only run targets without a successful snapshot in the
  // last 6h (useful for resuming an interrupted bulk run cheaply).
  const skipRecent = req.query?.skipRecent === 'true' || req.body?.skipRecent === true;

  bulkRunInFlight = true;
  res.json({ ok: true, started: true, targets: FEED_TARGETS.length, skipRecent });

  runAllSnapshots('manual', { skipRecent })
    .catch(e => console.error('Feed Monitor bulk run error:', e?.message))
    .finally(() => { bulkRunInFlight = false; });
});

// ─── GET /api/feed-monitor/summary ─────────────────────────
router.get('/summary', (req, res) => {
  try {
    const brand  = normBrand(req.query.brand);
    const market = String(req.query.market || 'FR').toUpperCase();
    const days   = Math.max(1, Math.min(90, parseInt(req.query.days || '7', 10)));
    if (!brand) return res.status(400).json({ error: 'Invalid brand' });

    const lastRun = db.prepare(`
      SELECT * FROM snapshot_runs
      WHERE brand = ? AND market = ? AND status = 'success'
      ORDER BY run_date DESC
      LIMIT 1
    `).get(brand, market);

    let lastSnapshot = null;
    let stock = null;
    if (lastRun) {
      const criticalCount = db.prepare(`
        SELECT COUNT(*) AS n FROM diffs_history
        WHERE brand = ? AND market = ? AND is_critical = 1
        AND date(detected_at) = date(?)
      `).get(brand, market, lastRun.run_date)?.n || 0;

      lastSnapshot = {
        date:             lastRun.run_date,
        trigger:          lastRun.trigger_type,
        total_products:   lastRun.total_products,
        added:            lastRun.products_added,
        removed:          lastRun.products_removed,
        modified:         lastRun.products_modified,
        duration_ms:      lastRun.duration_ms,
        critical_changes: criticalCount,
      };

      // Stock counts from the current snapshot table.
      const stockCounts = db.prepare(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN lower(json_extract(attributes, '$.availability')) IN ('in stock', 'in_stock') THEN 1 ELSE 0 END) AS in_stock,
          SUM(CASE WHEN lower(json_extract(attributes, '$.availability')) IN ('out of stock', 'out_of_stock') THEN 1 ELSE 0 END) AS out_of_stock,
          SUM(CASE WHEN lower(json_extract(attributes, '$.availability')) IN ('preorder', 'backorder') THEN 1 ELSE 0 END) AS other
        FROM products_current
        WHERE brand = ? AND market = ?
      `).get(brand, market) || {};

      // Transitions detected on the same day as the last snapshot.
      const transitions = db.prepare(`
        SELECT
          SUM(CASE WHEN lower(old_value) LIKE '%in stock%'     AND lower(new_value) LIKE '%out of stock%' THEN 1 ELSE 0 END) AS to_out_of_stock,
          SUM(CASE WHEN lower(old_value) LIKE '%out of stock%' AND lower(new_value) LIKE '%in stock%'     THEN 1 ELSE 0 END) AS to_in_stock
        FROM diffs_history
        WHERE brand = ? AND market = ?
          AND attribute = 'availability'
          AND date(detected_at) = date(?)
      `).get(brand, market, lastRun.run_date) || {};

      stock = {
        total:               stockCounts.total || 0,
        in_stock:            stockCounts.in_stock || 0,
        out_of_stock:        stockCounts.out_of_stock || 0,
        other:               stockCounts.other || 0,
        transitions_to_out:  transitions.to_out_of_stock || 0,
        transitions_to_in:   transitions.to_in_stock || 0,
      };
    }

    // Trend over last N days — group diffs by detection day
    const trendRows = db.prepare(`
      SELECT date(detected_at) AS day,
             SUM(CASE WHEN change_type = 'ADDED'    THEN 1 ELSE 0 END) AS added,
             SUM(CASE WHEN change_type = 'REMOVED'  THEN 1 ELSE 0 END) AS removed,
             SUM(CASE WHEN change_type = 'MODIFIED' AND is_critical = 0 THEN 1 ELSE 0 END) AS modified,
             SUM(CASE WHEN change_type = 'MODIFIED' AND is_critical = 1 THEN 1 ELSE 0 END) AS critical
      FROM diffs_history
      WHERE brand = ? AND market = ?
        AND detected_at >= datetime('now', ?)
      GROUP BY day
      ORDER BY day ASC
    `).all(brand, market, `-${days} days`);

    res.json({
      last_snapshot: lastSnapshot,
      stock,
      trend:         trendRows.map(r => ({
        date:     r.day,
        added:    r.added || 0,
        removed:  r.removed || 0,
        modified: r.modified || 0,
        critical: r.critical || 0,
      })),
    });
  } catch (e) {
    console.error('Feed Monitor summary error:', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// ─── GET /api/feed-monitor/diffs ───────────────────────────
router.get('/diffs', (req, res) => {
  try {
    const brand  = normBrand(req.query.brand);
    const market = String(req.query.market || 'FR').toUpperCase();
    if (!brand) return res.status(400).json({ error: 'Invalid brand' });

    const { from, to, type, attribute, search } = req.query;
    const criticalOnly = req.query.critical_only === 'true';
    const limit  = Math.min(50000, parseInt(req.query.limit  || '100', 10));
    const offset = Math.max(0,    parseInt(req.query.offset || '0',   10));

    const conds = ['brand = ?', 'market = ?'];
    const args  = [brand, market];

    if (from)         { conds.push('detected_at >= ?'); args.push(from); }
    if (to)           { conds.push('detected_at <= ?'); args.push(`${to} 23:59:59`); }
    if (type && type !== 'all') {
      conds.push('change_type = ?'); args.push(String(type).toUpperCase());
    }
    if (attribute && attribute !== 'all') {
      conds.push('attribute = ?'); args.push(attribute);
    }
    if (criticalOnly) conds.push('is_critical = 1');
    if (search) {
      conds.push('(product_id LIKE ? OR product_title LIKE ?)');
      args.push(`%${search}%`, `%${search}%`);
    }

    const where = conds.join(' AND ');

    const total = db.prepare(`SELECT COUNT(*) AS n FROM diffs_history WHERE ${where}`).get(...args)?.n || 0;
    const rows  = db.prepare(`
      SELECT id, brand, market, product_id, product_title, change_type, attribute,
             old_value, new_value, detected_at, is_critical
      FROM diffs_history
      WHERE ${where}
      ORDER BY detected_at DESC, id DESC
      LIMIT ? OFFSET ?
    `).all(...args, limit, offset);

    res.json({
      total,
      limit,
      offset,
      rows: rows.map(r => ({
        ...r,
        is_critical:    !!r.is_critical,
        attribute_label: r.attribute ? attributeLabel(r.attribute) : null,
      })),
    });
  } catch (e) {
    console.error('Feed Monitor diffs error:', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// ─── GET /api/feed-monitor/attribute-changes ───────────────
router.get('/attribute-changes', (req, res) => {
  try {
    const brand     = normBrand(req.query.brand);
    const market    = String(req.query.market || 'FR').toUpperCase();
    const attribute = req.query.attribute;
    const days      = Math.max(1, Math.min(365, parseInt(req.query.days || '90', 10)));
    if (!brand)     return res.status(400).json({ error: 'Invalid brand' });
    if (!attribute) return res.status(400).json({ error: 'Missing attribute' });

    const rows = db.prepare(`
      SELECT date(detected_at) AS day, COUNT(*) AS modifications
      FROM diffs_history
      WHERE brand = ? AND market = ? AND attribute = ? AND change_type = 'MODIFIED'
        AND detected_at >= datetime('now', ?)
      GROUP BY day
      ORDER BY day ASC
    `).all(brand, market, attribute, `-${days} days`);

    // Detect anomalies (>3σ above mean)
    const counts = rows.map(r => r.modifications);
    const mean   = counts.length ? counts.reduce((s, n) => s + n, 0) / counts.length : 0;
    const variance = counts.length
      ? counts.reduce((s, n) => s + (n - mean) ** 2, 0) / counts.length
      : 0;
    const stdDev = Math.sqrt(variance);
    const threshold = mean + 3 * stdDev;

    const anomalies = rows.filter(r => stdDev > 0 && r.modifications > threshold);

    res.json({
      attribute,
      attribute_label: attributeLabel(attribute),
      days,
      mean: Math.round(mean * 100) / 100,
      std_dev: Math.round(stdDev * 100) / 100,
      threshold: Math.round(threshold * 100) / 100,
      series: rows,
      anomalies,
    });
  } catch (e) {
    console.error('Feed Monitor attribute-changes error:', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// ─── GET /api/feed-monitor/runs ────────────────────────────
router.get('/runs', (req, res) => {
  try {
    const brand = normBrand(req.query.brand);
    const limit = Math.min(100, parseInt(req.query.limit || '20', 10));
    if (!brand) return res.status(400).json({ error: 'Invalid brand' });

    const rows = db.prepare(`
      SELECT id, brand, market, run_date, total_products,
             products_added, products_removed, products_modified,
             trigger_type, duration_ms, status
      FROM snapshot_runs
      WHERE brand = ?
      ORDER BY run_date DESC
      LIMIT ?
    `).all(brand, limit);

    res.json({ runs: rows });
  } catch (e) {
    console.error('Feed Monitor runs error:', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// ─── POST /api/feed-monitor/compare-import ─────────────────
// One-shot diff between an uploaded feed (treated as the "old" reference)
// and the current live snapshot in DB. Nothing is written to history.
// Body: { brand, market, products: [...] } where each product is an object
// with at least { id } and any subset of MONITORED_ATTRIBUTES keys.
router.post('/compare-import', (req, res) => {
  try {
    const brand  = normBrand(req.body?.brand);
    const market = String(req.body?.market || 'FR').toUpperCase();
    const products = Array.isArray(req.body?.products) ? req.body.products : null;
    if (!brand)    return res.status(400).json({ error: 'Invalid brand' });
    if (!products) return res.status(400).json({ error: 'Missing products array' });
    if (!products.length) return res.status(400).json({ error: 'Empty products array' });

    const currentMap = loadCurrentSnapshotMap(brand, market);
    if (currentMap.size === 0) {
      return res.status(409).json({
        error: 'Aucun snapshot courant en base — lancez un snapshot manuel avant de comparer.',
      });
    }

    // Treat uploaded products as the OLD reference, current snapshot as NEW.
    // Normalize each imported row to use only known attribute keys.
    const oldMap = new Map();
    for (const raw of products) {
      if (!raw || !raw.id) continue;
      const norm = { id: String(raw.id), title: raw.title || '' };
      for (const attr of ALL_ATTRIBUTES) {
        if (raw[attr] != null) norm[attr] = String(raw[attr]);
      }
      oldMap.set(norm.id, norm);
    }

    // computeDiffs(oldMap, newProducts) — but we want imported=old vs current=new.
    // Build current as array.
    const currentArray = Array.from(currentMap.entries()).map(([id, attrs]) => ({ id, ...attrs }));
    const diffs = computeDiffs(oldMap, currentArray);

    // Stats
    const summary = {
      imported_count:   products.length,
      imported_unique:  oldMap.size,
      current_count:    currentMap.size,
      added:            diffs.added.length,
      removed:          diffs.removed.length,
      modified_products: new Set(diffs.modified.map(m => m.product_id)).size,
      attribute_changes: diffs.modified.length,
      critical_changes:  diffs.modified.filter(m => m.is_critical).length,
    };

    // Stock breakdown — both the imported file and the current snapshot,
    // plus transitions inferred from the modified availability rows.
    function classifyAvailability(v) {
      const a = String(v || '').toLowerCase().trim();
      if (a === 'in stock' || a === 'in_stock') return 'in_stock';
      if (a === 'out of stock' || a === 'out_of_stock') return 'out_of_stock';
      if (a === 'preorder' || a === 'backorder') return 'other';
      return 'unknown';
    }
    function buildStockCounts(map) {
      const out = { total: map.size, in_stock: 0, out_of_stock: 0, other: 0, unknown: 0 };
      for (const p of map.values()) {
        out[classifyAvailability(p.availability)]++;
      }
      return out;
    }

    const importedStock = buildStockCounts(oldMap);
    const currentStock  = buildStockCounts(currentMap);

    let transitions_to_out = 0;
    let transitions_to_in  = 0;
    for (const m of diffs.modified) {
      if (m.attribute !== 'availability') continue;
      const oldClass = classifyAvailability(m.old_value);
      const newClass = classifyAvailability(m.new_value);
      if (oldClass === 'in_stock' && newClass === 'out_of_stock') transitions_to_out++;
      else if (oldClass === 'out_of_stock' && newClass === 'in_stock') transitions_to_in++;
    }

    const stock = {
      imported:     importedStock,
      current:      currentStock,
      transitions_to_out,
      transitions_to_in,
    };

    // Cap returned rows to keep payload reasonable.
    const CAP = 50000;
    const enrichMod = m => ({
      ...m,
      attribute_label: attributeLabel(m.attribute),
    });

    res.json({
      summary,
      stock,
      added:    diffs.added.slice(0, CAP).map(p => ({ product_id: p.id, product_title: p.title })),
      removed:  diffs.removed.slice(0, CAP).map(p => ({ product_id: p.product_id, product_title: p.title })),
      modified: diffs.modified.slice(0, CAP).map(enrichMod),
      truncated: {
        added:    diffs.added.length > CAP,
        removed:  diffs.removed.length > CAP,
        modified: diffs.modified.length > CAP,
      },
    });
  } catch (e) {
    console.error('Feed Monitor compare-import error:', e?.message);
    res.status(500).json({ error: e?.message });
  }
});

// ─── GET /api/feed-monitor/attributes ──────────────────────
// Lists every monitored attribute + its critical flag, used by the frontend
// for filters and the by-attribute selector.
router.get('/attributes', (_req, res) => {
  res.json({
    attributes: Object.entries(MONITORED_ATTRIBUTES).map(([key, meta]) => ({
      key,
      label:    meta.label,
      critical: meta.critical,
    })),
  });
});

export default router;
