// Pre-warm Merchant Center caches at server startup and refresh them on a
// background interval. MC data is independent of the date filter, so
// pre-warming makes the Shopping tab load near-instantly even on the first
// user request after a restart.

import {
  loadCacheFromDisk,
  getPriceMap,
  getPriceCompetitivenessData,
  getProductStatuses,
  getSalePriceMap,
} from './merchantCenterClient.js';
import { isAuthenticated } from '../auth.js';

// Most common combos that drive the Shopping tab.
// brand=ALL is the heaviest (16-account fan-out) — we warm it first.
const WARM_TARGETS = [
  { brand: 'COCOONCENTER',           market: 'ALL' },
  { brand: 'COCOONCENTER',           market: 'FR'  },
  { brand: 'PASCAL_COSTE',           market: 'FR'  },
  { brand: 'PARAPHARMACIE_LAFAYETTE', market: 'FR' },
];

const REFRESH_INTERVAL_MS = 2 * 60 * 60 * 1000; // 2h

async function warmOne({ brand, market }) {
  const t0 = Date.now();
  // Run all 4 MC fetches concurrently per (brand, market)
  await Promise.all([
    getPriceMap(brand, market).catch(() => null),
    getPriceCompetitivenessData(brand, market).catch(() => null),
    getProductStatuses(brand, market).catch(() => null),
    getSalePriceMap(brand, market).catch(() => null),
  ]);
  console.log(`MC warm [${brand}/${market}]: done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

async function warmAll() {
  if (!isAuthenticated()) {
    console.log('MC warm: skipped (not authenticated)');
    return;
  }
  console.log('MC warm: starting…');
  // Warm sequentially so we don't hammer the MC API with 16 parallel fans simultaneously
  for (const target of WARM_TARGETS) {
    await warmOne(target);
  }
  console.log('MC warm: all done');
}

export function initCacheWarmer() {
  // 1. Hydrate from disk first — instant, no API call
  loadCacheFromDisk();

  // 2. Kick off a warmup pass in the background. Don't await — server should
  //    boot immediately and serve from disk cache while fresh data fetches.
  //    Slight delay so the auth router has time to settle.
  setTimeout(() => { warmAll().catch(e => console.error('MC warm error:', e?.message)); }, 3000);

  // 3. Periodic refresh — keeps caches warm well within their TTLs.
  setInterval(() => {
    warmAll().catch(e => console.error('MC warm error:', e?.message));
  }, REFRESH_INTERVAL_MS);
}
