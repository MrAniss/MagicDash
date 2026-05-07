// Feed Monitor — daily snapshot + diff service.
// products_current holds the live snapshot (overwritten each run).
// diffs_history accumulates all changes detected since the previous snapshot.

import db from '../database/db.js';
import { fetchAllProducts } from './merchantCenterClient.js';
import { ALL_ATTRIBUTES, isCritical } from '../config/monitoredAttributes.js';
import { isDemoMode } from './demo/demoMode.js';

const FEED_BRANDS = ['BRAND_A', 'BRAND_B', 'BRAND_C', 'BRAND_D'];

// Full list of brand × market combos we snapshot. Brand A has 14 markets;
// only the UK account is shared (UK/US/CA/AU/SA/NO/IE) — UK is included here
// but the other shared markets are skipped by default (same merchant ID, runs
// can be added later if needed).
const FEED_TARGETS = [
  { brand: 'BRAND_A', market: 'FR' },
  { brand: 'BRAND_A', market: 'BE' },
  { brand: 'BRAND_A', market: 'NL' },
  { brand: 'BRAND_A', market: 'DE' },
  { brand: 'BRAND_A', market: 'ES' },
  { brand: 'BRAND_A', market: 'IT' },
  { brand: 'BRAND_A', market: 'AT' },
  { brand: 'BRAND_A', market: 'FI' },
  { brand: 'BRAND_A', market: 'IE' },
  { brand: 'BRAND_A', market: 'PL' },
  { brand: 'BRAND_A', market: 'PT' },
  { brand: 'BRAND_A', market: 'RO' },
  { brand: 'BRAND_A', market: 'SE' },
  { brand: 'BRAND_A', market: 'UK' },
  { brand: 'BRAND_B', market: 'FR' },
  { brand: 'BRAND_C', market: 'FR' },
  { brand: 'BRAND_D', market: 'FR' },
];

// In-flight tracker so the manual button can't double-trigger a snapshot
const inFlight = new Set();

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function loadCurrentSnapshotMap(brand, market) {
  return loadCurrentSnapshot(brand, market);
}

export { computeDiffs };

function loadCurrentSnapshot(brand, market) {
  const rows = db
    .prepare(`SELECT product_id, attributes FROM products_current WHERE brand = ? AND market = ?`)
    .all(brand, market);
  const map = new Map();
  for (const r of rows) {
    try { map.set(r.product_id, JSON.parse(r.attributes)); }
    catch { /* skip corrupt row */ }
  }
  return map;
}

function computeDiffs(oldMap, newProducts) {
  const newMap = new Map(newProducts.map(p => [p.id, p]));
  const diffs = { added: [], removed: [], modified: [] };

  for (const [id, product] of newMap) {
    if (!oldMap.has(id)) diffs.added.push(product);
  }
  for (const [id, oldAttrs] of oldMap) {
    if (!newMap.has(id)) diffs.removed.push({ product_id: id, ...oldAttrs });
  }
  for (const [id, newProduct] of newMap) {
    if (!oldMap.has(id)) continue;
    const oldAttrs = oldMap.get(id);
    for (const attr of ALL_ATTRIBUTES) {
      const oldVal = oldAttrs[attr] ?? '';
      const newVal = newProduct[attr] ?? '';
      if (String(oldVal) !== String(newVal)) {
        diffs.modified.push({
          product_id:    id,
          product_title: newProduct.title || oldAttrs.title || '',
          attribute:     attr,
          old_value:     String(oldVal),
          new_value:     String(newVal),
          is_critical:   isCritical(attr) ? 1 : 0,
        });
      }
    }
  }
  return diffs;
}

function insertDiffs(brand, market, diffs) {
  const insertDiff = db.prepare(`
    INSERT INTO diffs_history
      (brand, market, product_id, product_title, change_type, attribute, old_value, new_value, is_critical)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    for (const p of diffs.added) {
      insertDiff.run(brand, market, p.id, p.title || '', 'ADDED', null, null, null, 0);
    }
    for (const p of diffs.removed) {
      insertDiff.run(brand, market, p.product_id, p.title || '', 'REMOVED', null, null, null, 0);
    }
    for (const m of diffs.modified) {
      insertDiff.run(brand, market, m.product_id, m.product_title, 'MODIFIED',
                     m.attribute, m.old_value, m.new_value, m.is_critical);
    }
  });
  tx();
}

function replaceCurrentSnapshot(brand, market, products) {
  const date = todayISO();
  const del = db.prepare(`DELETE FROM products_current WHERE brand = ? AND market = ?`);
  const ins = db.prepare(`
    INSERT INTO products_current (brand, market, product_id, attributes, snapshot_date)
    VALUES (?, ?, ?, ?, ?)
  `);
  const tx = db.transaction(() => {
    del.run(brand, market);
    for (const p of products) {
      ins.run(brand, market, p.id, JSON.stringify(p), date);
    }
  });
  tx();
}

function logSnapshotRun(payload) {
  db.prepare(`
    INSERT INTO snapshot_runs
      (brand, market, total_products, products_added, products_removed, products_modified, trigger_type, duration_ms, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    payload.brand, payload.market, payload.total_products,
    payload.products_added, payload.products_removed, payload.products_modified,
    payload.trigger_type, payload.duration_ms, payload.status
  );
}

export function isSnapshotRunning(brand, market) {
  return inFlight.has(`${brand}::${market}`);
}

export function getRunningSnapshots() {
  return Array.from(inFlight);
}

export async function runSnapshot(brand, market = 'FR', triggerType = 'auto') {
  const key = `${brand}::${market}`;
  if (inFlight.has(key)) {
    throw new Error(`Snapshot already running for ${brand}/${market}`);
  }
  inFlight.add(key);
  const startTime = Date.now();

  try {
    console.log(`Feed Monitor [${brand}/${market}]: starting (${triggerType})…`);

    const oldMap = loadCurrentSnapshot(brand, market);
    const isFirstRun = oldMap.size === 0;

    const products = await fetchAllProducts(brand, market);
    if (!products.length) {
      logSnapshotRun({
        brand, market,
        total_products: 0, products_added: 0, products_removed: 0, products_modified: 0,
        trigger_type: triggerType, duration_ms: Date.now() - startTime, status: 'failed',
      });
      throw new Error(`No products returned for ${brand}/${market}`);
    }

    let diffs = { added: [], removed: [], modified: [] };
    if (!isFirstRun) {
      diffs = computeDiffs(oldMap, products);
      insertDiffs(brand, market, diffs);
    }
    replaceCurrentSnapshot(brand, market, products);

    const result = {
      brand, market,
      total_products:    products.length,
      products_added:    diffs.added.length,
      products_removed:  diffs.removed.length,
      products_modified: new Set(diffs.modified.map(m => m.product_id)).size,
      attributes_modified: diffs.modified.length,
      critical_changes:  diffs.modified.filter(m => m.is_critical).length,
      first_run:         isFirstRun,
      duration_ms:       Date.now() - startTime,
    };

    logSnapshotRun({
      brand, market,
      total_products:    result.total_products,
      products_added:    result.products_added,
      products_removed:  result.products_removed,
      products_modified: result.products_modified,
      trigger_type: triggerType,
      duration_ms: result.duration_ms,
      status: 'success',
    });

    console.log(`Feed Monitor [${brand}/${market}]: done in ${(result.duration_ms / 1000).toFixed(1)}s — +${result.products_added} -${result.products_removed} ~${result.products_modified} (${result.critical_changes} critical)`);
    return result;
  } catch (e) {
    console.error(`Feed Monitor [${brand}/${market}]: error —`, e?.message);
    logSnapshotRun({
      brand, market,
      total_products: 0, products_added: 0, products_removed: 0, products_modified: 0,
      trigger_type: triggerType, duration_ms: Date.now() - startTime, status: 'failed',
    });
    throw e;
  } finally {
    inFlight.delete(key);
  }
}

// Returns the set of "brand|market" keys with a successful snapshot in the
// last `hours` hours — used to skip already-done targets when resuming a
// bulk run that was interrupted (e.g. by a backend reboot).
function getRecentlySucceededKeys(hours = 6) {
  const rows = db.prepare(`
    SELECT DISTINCT brand, market FROM snapshot_runs
    WHERE status = 'success'
      AND run_date >= datetime('now', ?)
  `).all(`-${hours} hours`);
  return new Set(rows.map(r => `${r.brand}|${r.market}`));
}

// Iterate every brand × market sequentially. Each combo is wrapped in
// try/catch so one failure doesn't block the rest. Used by both the cron
// job and the manual /run-all endpoint.
// Options:
//   - skipRecent: if true, skip cibles with a successful run in the last 6h.
export async function runAllSnapshots(triggerType = 'auto', { skipRecent = false } = {}) {
  if (isDemoMode()) {
    console.log('Feed Monitor: bulk run skipped (demo mode)');
    return [];
  }
  const skipKeys = skipRecent ? getRecentlySucceededKeys(6) : new Set();
  const targets = FEED_TARGETS.filter(t => !skipKeys.has(`${t.brand}|${t.market}`));
  if (skipRecent) {
    console.log(`Feed Monitor: bulk run starting (${triggerType}) — ${targets.length}/${FEED_TARGETS.length} targets (${skipKeys.size} skipped: recent success)`);
  } else {
    console.log(`Feed Monitor: bulk run starting (${triggerType}) — ${targets.length} targets`);
  }
  const results = [];
  const t0 = Date.now();
  for (const { brand, market } of targets) {
    try {
      const r = await runSnapshot(brand, market, triggerType);
      results.push({ brand, market, ok: true, ...r });
    } catch (e) {
      results.push({ brand, market, ok: false, error: e?.message });
    }
  }
  console.log(`Feed Monitor: bulk run done in ${((Date.now() - t0) / 1000).toFixed(1)}s — ${results.filter(r => r.ok).length}/${results.length} succeeded`);
  return results;
}

// Backwards-compat alias kept for existing callers.
export const runDailySnapshotForAllBrands = runAllSnapshots;

export { FEED_BRANDS, FEED_TARGETS };
