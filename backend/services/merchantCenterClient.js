import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getOAuth2Client } from '../auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '..', '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'mc-cache.json');

// ─── Merchant Center IDs ──────────────────────────────────
const MC_CONFIG = {
  COCOONCENTER: [
    '7284268',    // cocooncenter.com (FR)
    '134179870',  // cocooncenter.be
    '279126399',  // cocooncenter.co.uk  (UK + AU, CA, SA, NO, IE via shared domain)
    '115705933',  // cocooncenter.de
    '121177476',  // cocooncenter.es
    '560424120',  // cocooncenter.it
    '5737145093', // cocooncenter.at
    '5752364776', // cocooncenter.fi
    '5747584038', // cocooncenter.ie
    '5752192866', // cocooncenter.nl
    '5351916428', // cocooncenter.pl
    '5751926635', // cocooncenter.pt
    '5748405752', // cocooncenter.ro
    '5752364749', // cocooncenter.se
  ],
  PASCAL_COSTE:            ['9831411'],
  PARAPHARMACIE_LAFAYETTE: ['510562869'],
};

// market code → { merchantId, countryCode }
// countryCode = ISO 3166-1 alpha-2 used in MC product IDs (product_view.id) and
// price_competitiveness.country_code. GB is used for the UK market.
const MC_MARKET = {
  COCOONCENTER: {
    FR: { merchantId: '7284268',    countryCode: 'FR' },
    BE: { merchantId: '134179870',  countryCode: 'BE' },
    UK: { merchantId: '279126399',  countryCode: 'GB' },
    US: { merchantId: '279126399',  countryCode: 'US' },
    CA: { merchantId: '279126399',  countryCode: 'CA' },
    AU: { merchantId: '279126399',  countryCode: 'AU' },
    SA: { merchantId: '279126399',  countryCode: 'SA' },
    NO: { merchantId: '279126399',  countryCode: 'NO' },
    IE: { merchantId: '279126399',  countryCode: 'IE' },
    DE: { merchantId: '115705933',  countryCode: 'DE' },
    ES: { merchantId: '121177476',  countryCode: 'ES' },
    IT: { merchantId: '560424120',  countryCode: 'IT' },
    AT: { merchantId: '5737145093', countryCode: 'AT' },
    FI: { merchantId: '5752364776', countryCode: 'FI' },
    NL: { merchantId: '5752192866', countryCode: 'NL' },
    PL: { merchantId: '5351916428', countryCode: 'PL' },
    PT: { merchantId: '5751926635', countryCode: 'PT' },
    RO: { merchantId: '5748405752', countryCode: 'RO' },
    SE: { merchantId: '5752364749', countryCode: 'SE' },
  },
  PASCAL_COSTE: {
    FR: { merchantId: '9831411', countryCode: 'FR' },
  },
  PARAPHARMACIE_LAFAYETTE: {
    FR: { merchantId: '510562869', countryCode: 'FR' },
  },
};

// Returns [{ merchantId, countryCode }] for a given brand + market.
// For market='ALL', returns all accounts with countryCode=null (no country filter).
function getMcTargets(brand, market = 'ALL') {
  const bKey = (brand || '').toUpperCase();
  if (market !== 'ALL' && MC_MARKET[bKey]?.[market]) {
    return [MC_MARKET[bKey][market]];
  }
  if (bKey === 'ALL') return Object.values(MC_CONFIG).flat().map(id => ({ merchantId: id, countryCode: null }));
  
  // For PASCAL_COSTE and PARAPHARMACIE_LAFAYETTE, if market is ALL, return the single account they have
  if (MC_CONFIG[bKey]) {
     return MC_CONFIG[bKey].map(id => ({ merchantId: id, countryCode: (market === 'ALL' ? null : market) }));
  }
  return [];
}

// ─── Price conversion ─────────────────────────────────────
// MC reports API: 1 currency unit = 1 000 000 micros.
// Confirmed: 12 310 000 → 12.31 EUR, 687 970 000 → 687.97 SEK.
const MICROS_DIVISOR = 1_000_000;

function microsToPrice(micros) {
  if (!micros) return null;
  return Math.round(Number(micros) / MICROS_DIVISOR * 100) / 100;
}

// Extract the ISO country code from a feed-label-style country slot in
// productId — Cocooncenter uses custom labels like "FR_NEW", "FR_OLD" instead
// of the bare ISO code. We want "FR_NEW" to match "FR" for filtering, and we
// also want to match destinationStatuses' approvedCountries/disapprovedCountries
// (which use ISO codes).
function baseCountry(rowCountry) {
  return String(rowCountry || '').split('_')[0];
}

// ─── Caches ───────────────────────────────────────────────
// keyed by `${merchantId}::${countryCode || 'ALL'}`
const priceCache  = new Map();
const pcCache     = new Map();
const statusCache = new Map(); // productstatuses (issues + aggregated_destination_status)
const promoCache  = new Map(); // sale_price info from ProductView
const linkCache   = new Map(); // product page URL from products.list

// In-flight deduplication: concurrent callers share the same pending Promise
// instead of each firing a redundant MC API request (prevents cache stampede).
const priceInFlight  = new Map();
const pcInFlight     = new Map();
const statusInFlight = new Map();
const promoInFlight  = new Map();
const linkInFlight   = new Map();

const PRICE_CACHE_TTL  = 60 * 60 * 1000;          // 1h
const PC_CACHE_TTL     = 3 * 60 * 60 * 1000;      // 3h
const STATUS_CACHE_TTL = 60 * 60 * 1000;          // 1h
const PROMO_CACHE_TTL  = 60 * 60 * 1000;          // 1h
const LINK_CACHE_TTL   = 7 * 24 * 60 * 60 * 1000; // 7d — URLs are stable

export function clearMcCache() {
  priceCache.clear();
  pcCache.clear();
  statusCache.clear();
  promoCache.clear();
  linkCache.clear();
  saveCacheToDisk(); // wipe the persisted snapshot too
}

// ─── Persistent cache (disk) ──────────────────────────────
// Survives server restarts so the first user request after a restart
// hits warm data instead of re-fanning out across 16 MC accounts.
// Stored as a single JSON snapshot — small enough (~few hundred KB).

function serializeCache(map) {
  return Array.from(map.entries());
}

function deserializeCache(arr, target, ttl) {
  if (!Array.isArray(arr)) return 0;
  const now = Date.now();
  let loaded = 0;
  for (const [key, entry] of arr) {
    if (entry && entry.ts && (now - entry.ts) < ttl) {
      target.set(key, entry);
      loaded++;
    }
  }
  return loaded;
}

export function loadCacheFromDisk() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return;
    const raw = fs.readFileSync(CACHE_FILE, 'utf8');
    const snap = JSON.parse(raw);
    const p  = deserializeCache(snap.priceCache,  priceCache,  PRICE_CACHE_TTL);
    const pc = deserializeCache(snap.pcCache,     pcCache,     PC_CACHE_TTL);
    const st = deserializeCache(snap.statusCache, statusCache, STATUS_CACHE_TTL);
    const pr = deserializeCache(snap.promoCache,  promoCache,  PROMO_CACHE_TTL);
    const lk = deserializeCache(snap.linkCache,   linkCache,   LINK_CACHE_TTL);
    // Drop empty linkCache entries — they're poisoned cache from a prior failed
    // fetch and would block live data for the full 7-day TTL otherwise.
    let lkPruned = 0;
    for (const [k, v] of linkCache.entries()) {
      if (!v?.links || Object.keys(v.links).length === 0) {
        linkCache.delete(k);
        lkPruned++;
      }
    }
    console.log(`MC cache: loaded from disk — price=${p}, pc=${pc}, status=${st}, promo=${pr}, link=${lk}${lkPruned ? ` (${lkPruned} empty pruned)` : ''}`);
  } catch (e) {
    console.warn('MC cache: failed to load from disk —', e?.message);
  }
}

let saveTimer = null;
export function saveCacheToDisk() {
  // Debounce — coalesce bursts of writes within 5s into a single flush.
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
      const snap = {
        priceCache:  serializeCache(priceCache),
        pcCache:     serializeCache(pcCache),
        statusCache: serializeCache(statusCache),
        promoCache:  serializeCache(promoCache),
        linkCache:   serializeCache(linkCache),
      };
      fs.writeFileSync(CACHE_FILE, JSON.stringify(snap));
    } catch (e) {
      console.warn('MC cache: failed to save to disk —', e?.message);
    }
  }, 5000);
}

// ─── Catalog prices via ProductView ───────────────────────
// countryCode filters product_view.id — format: channel:lang:COUNTRY:offerId
async function fetchProductPricesForMerchant(merchantId, countryCode = null) {
  const cacheKey = `${merchantId}::${countryCode || 'ALL'}`;
  const cached = priceCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PRICE_CACHE_TTL) return cached.prices;

  const auth    = getOAuth2Client();
  const content = google.content({ version: 'v2.1', auth });

  const query = `SELECT product_view.id, product_view.offer_id, product_view.price_micros, product_view.currency_code FROM ProductView`;

  const prices = {};
  let pageToken;
  let pages = 0;

  do {
    const reqBody = { query, pageSize: 1000 };
    if (pageToken) reqBody.pageToken = pageToken;

    const res = await content.reports.search({
      merchantId,
      requestBody: reqBody,
    }).catch(e => {
      console.error(`MC product prices ${merchantId}:`, e?.message || e);
      return { data: { results: [] } };
    });

    for (const row of (res.data.results || [])) {
      const pv = row.productView;
      if (!pv?.offerId || !pv?.priceMicros) continue;

      // Filter by country code when specified.
      // product_view.id format: "channel:lang:COUNTRY:offerId" — but feeds may
      // use custom country labels ("FR_NEW") so we strip the "_*" suffix.
      if (countryCode) {
        const idParts = (pv.id || '').split(':');
        if (baseCountry(idParts[2]) !== countryCode) continue;
      }

      // Prefer online over local when both exist for the same offerId
      const existing = prices[pv.offerId];
      const isOnline = (pv.id || '').startsWith('online:');
      if (existing && !isOnline) continue;

      prices[pv.offerId] = {
        price:    microsToPrice(pv.priceMicros),
        currency: pv.currencyCode || 'EUR',
      };
    }

    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < 500);

  console.log(`MC catalog: ${Object.keys(prices).length} products for ${merchantId} country=${countryCode || 'ALL'}`);
  priceCache.set(cacheKey, { prices, ts: Date.now() });
  saveCacheToDisk();
  return prices;
}

export async function getPriceMap(brand, market = 'ALL') {
  const cacheKey = `priceMap::${brand}::${market}`;

  // Return in-flight promise if one is already running for this key
  if (priceInFlight.has(cacheKey)) return priceInFlight.get(cacheKey);

  const promise = (async () => {
    try {
      const targets = getMcTargets(brand, market);
      if (!targets.length) return {};
      const maps = await Promise.all(
        targets.map(({ merchantId, countryCode }) => fetchProductPricesForMerchant(merchantId, countryCode))
      );
      return Object.assign({}, ...maps);
    } catch (e) {
      console.error('getPriceMap error:', e?.message);
      return {};
    } finally {
      priceInFlight.delete(cacheKey);
    }
  })();

  priceInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Price competitiveness via PriceCompetitivenessProductView ───
function computeCompetitiveness(ourMicros, benchmarkMicros) {
  const our       = microsToPrice(ourMicros);
  const benchmark = microsToPrice(benchmarkMicros);
  const delta     = benchmark > 0 ? (our - benchmark) / benchmark : 0;
  return {
    our_price:       our,
    benchmark_price: benchmark,
    delta_pct:       Math.round(delta * 10000) / 100,
    delta_eur:       Math.round((our - benchmark) * 100) / 100,
    status: delta < -0.05 ? 'COMPETITIVE' : delta > 0.05 ? 'EXPENSIVE' : 'ON_PAR',
  };
}

// No WHERE clause — PriceCompetitivenessProductView does not support filtering
// price_competitiveness.country_code via GAQL WHERE, so we filter client-side
// (same approach as fetchProductPricesForMerchant uses for product_view.id).
async function fetchPriceCompForMerchant(merchantId, countryCode = null) {
  const auth    = getOAuth2Client();
  const content = google.content({ version: 'v2.1', auth });

  const query = `SELECT product_view.id, product_view.offer_id, product_view.price_micros, product_view.currency_code, price_competitiveness.country_code, price_competitiveness.benchmark_price_micros, price_competitiveness.benchmark_price_currency_code FROM PriceCompetitivenessProductView`;

  const results = {};
  let pageToken;
  let pages = 0;
  let totalRows = 0;
  let skippedCountry = 0;

  do {
    const reqBody = { query, pageSize: 1000 };
    if (pageToken) reqBody.pageToken = pageToken;

    const res = await content.reports.search({
      merchantId,
      requestBody: reqBody,
    }).catch(e => {
      console.error(`MC price comp ${merchantId}: API error — ${e?.message || e}`);
      return { data: { results: [] } };
    });

    for (const row of (res.data.results || [])) {
      totalRows++;
      const pv = row.productView;
      const pc = row.priceCompetitiveness;
      if (!pv?.offerId || !pc?.benchmarkPriceMicros) continue;

      // Client-side country filter — check price_competitiveness.country_code
      if (countryCode && pc.countryCode !== countryCode) {
        skippedCountry++;
        continue;
      }

      const ourMicros       = Number(pv.priceMicros       || 0);
      const benchmarkMicros = Number(pc.benchmarkPriceMicros || 0);
      if (!ourMicros || !benchmarkMicros) continue;

      // Prefer online channel when both local and online exist for same offerId
      const existing = results[pv.offerId];
      const isOnline = (pv.id || '').startsWith('online:');
      if (existing && !isOnline) continue;

      results[pv.offerId] = computeCompetitiveness(ourMicros, benchmarkMicros);
    }

    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < 500);

  const matched = Object.keys(results).length;
  console.log(`MC price comp ${merchantId} country=${countryCode || 'ALL'}: ${totalRows} rows fetched, ${skippedCountry} filtered out, ${matched} matched`);
  return results;
}

export async function getPriceCompetitivenessData(brand, market = 'ALL') {
  const cacheKey = `${brand}::${market}`;

  // 1. Serve from cache if fresh
  const cached = pcCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PC_CACHE_TTL) return cached.data;

  // 2. Share in-flight promise — prevents N concurrent callers each firing their own MC request
  if (pcInFlight.has(cacheKey)) {
    console.log(`MC price comp [${brand}/${market}]: reusing in-flight request`);
    return pcInFlight.get(cacheKey);
  }

  const promise = (async () => {
    try {
      const targets = getMcTargets(brand, market);
      if (!targets.length) return {};

      const maps = await Promise.all(
        targets.map(({ merchantId, countryCode }) => fetchPriceCompForMerchant(merchantId, countryCode))
      );
      const merged = Object.assign({}, ...maps);
      const count = Object.keys(merged).length;
      console.log(`MC price comp total: ${count} products for ${brand}/${market}`);

      // 3. Only cache non-empty results — avoids poisoning the cache with temporary API failures
      if (count > 0) {
        pcCache.set(cacheKey, { data: merged, ts: Date.now() });
        saveCacheToDisk();
      } else {
        console.warn(`MC price comp [${brand}/${market}]: got 0 results — NOT caching, will retry on next request`);
      }
      return merged;
    } catch (e) {
      console.error('getPriceCompetitivenessData error:', e?.message);
      return {};
    } finally {
      pcInFlight.delete(cacheKey);
    }
  })();

  pcInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Product statuses (productstatuses.list) ──────────────
// Classifies issues → IMAGE / DESCRIPTION / GTIN / CATEGORY / SHIPPING / PRICE / AVAILABILITY / OTHER
// Checks `code` (structured, English, stable) first, then description/attribute.
function classifyIssue({ code = '', description = '', attributeName = '' } = {}) {
  const hay = `${code} ${attributeName} ${description}`.toLowerCase();
  if (hay.includes('image'))                                    return 'IMAGE';
  if (hay.includes('gtin') || hay.includes('mpn') || hay.includes('identifier')) return 'GTIN';
  if (hay.includes('categor') || hay.includes('google_product_category') || hay.includes('product_type')) return 'CATEGORY';
  if (hay.includes('shipping') || hay.includes('livraison'))    return 'SHIPPING';
  if (hay.includes('availab') || hay.includes('dispon') || hay.includes('stock')) return 'AVAILABILITY';
  if (hay.includes('price') || hay.includes('prix') || hay.includes('sale_price')) return 'PRICE';
  if (hay.includes('description') || hay.includes('title') || hay.includes('titre')) return 'DESCRIPTION';
  return 'OTHER';
}

// Normalize aggregated_destination_status → active | disapproved | limited | pending
function normalizeAgg(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('disapprov'))                     return 'disapproved';
  if (s.includes('limited') || s.includes('warn')) return 'limited';
  if (s.includes('pending'))                       return 'pending';
  if (s.includes('active') || s.includes('eligibl')) return 'active';
  return 'pending';
}

async function fetchProductStatusesForMerchant(merchantId, countryCode = null) {
  const cacheKey = `${merchantId}::${countryCode || 'ALL'}`;
  const cached = statusCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < STATUS_CACHE_TTL) return cached.items;

  const auth    = getOAuth2Client();
  const content = google.content({ version: 'v2.1', auth });

  const items = [];
  let pageToken;
  let pages = 0;

  do {
    const params = { merchantId, maxResults: 250 };
    if (pageToken) params.pageToken = pageToken;

    const res = await content.productstatuses.list(params).catch(e => {
      console.error(`MC productstatuses ${merchantId}:`, e?.message || e);
      return { data: { resources: [] } };
    });

    for (const ps of (res.data.resources || [])) {
      // productstatuses ids are like "online:fr:FR:REF123" — same shape as ProductView.id
      const idParts = (ps.productId || '').split(':');
      const rowCountry = idParts[2] || '';
      const productCountry = baseCountry(rowCountry); // strip "_NEW", "_OLD" etc.
      if (countryCode && productCountry !== countryCode) continue;

      const offerId = idParts.slice(3).join(':') || ps.productId;
      const issues = (ps.itemLevelIssues || []).map(i => ({
        type:          classifyIssue({ code: i.code, description: i.description, attributeName: i.attributeName }),
        code:          i.code || null,
        description:   i.description || i.code || '',
        detail:        i.detail || null,
        documentation: i.documentation || null,
        attribute:     i.attributeName || null,
        resolution:    i.resolution || null,
        severity:      (i.servability || '').toLowerCase() || 'warning',
        destination:   i.destination || null,
      }));

      // Derive aggregated status. MC v2.1 returns `destinationStatuses` as an
      // array of { destination, approvedCountries, pendingCountries,
      // disapprovedCountries } — one entry per destination (Shopping ads,
      // Free listings, etc.). A product can be approved in some countries
      // and disapproved in others, so we must:
      // 1. Walk ALL destinations (not just the first)
      // 2. Match against THIS product's country (from productId), not just
      //    "any country has X" — otherwise BE-approved products with FR
      //    disapproval mask each other.
      let isDisapproved = false;
      let isApproved    = false;
      let isPending     = false;
      let countryArraysDecided = false;
      for (const ds of (ps.destinationStatuses || [])) {
        if (productCountry) {
          if (ds.disapprovedCountries?.includes(productCountry)) {
            isDisapproved = true; countryArraysDecided = true;
          }
          if (ds.approvedCountries?.includes(productCountry)) {
            isApproved = true; countryArraysDecided = true;
          }
          if (ds.pendingCountries?.includes(productCountry)) {
            isPending = true; countryArraysDecided = true;
          }
        } else {
          // No country filter (rare path) — fall back to "any disapproval anywhere"
          if (ds.disapprovedCountries?.length) { isDisapproved = true; countryArraysDecided = true; }
          if (ds.approvedCountries?.length)    { isApproved = true;    countryArraysDecided = true; }
          if (ds.pendingCountries?.length)     { isPending = true;     countryArraysDecided = true; }
        }
      }
      // Legacy string status field — only trust as fallback when the per-country
      // arrays gave no answer. Otherwise it can lie: MC sometimes reports
      // status:"disapproved" globally while approvedCountries=["FR"] for a
      // product that's actually live in FR.
      if (!countryArraysDecided) {
        for (const ds of (ps.destinationStatuses || [])) {
          if (!ds.status) continue;
          const s = String(ds.status).toLowerCase();
          if (s.includes('disapprov')) isDisapproved = true;
          else if (s.includes('approv') || s.includes('eligib')) isApproved = true;
          else if (s.includes('pending')) isPending = true;
        }
      }
      // Item-level issues with servability=disapproved are the only authoritative
      // signal that this specific country is blocked — they override the
      // approvedCountries listing if they conflict.
      if (issues.some(i => i.severity === 'disapproved')) isDisapproved = true;

      let status;
      if (isDisapproved)                           status = 'disapproved';
      else if (issues.length > 0 && isApproved)    status = 'limited';
      else if (isApproved)                         status = 'active';
      else if (isPending)                          status = 'pending';
      else                                         status = 'pending';

      items.push({
        item_id: offerId,
        title:   ps.title || '',
        brand:   ps.brand || null,
        status,
        issues,
      });
    }

    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < 200);

  console.log(`MC productstatuses ${merchantId} country=${countryCode || 'ALL'}: ${items.length} products`);
  statusCache.set(cacheKey, { items, ts: Date.now() });
  saveCacheToDisk();
  return items;
}

export async function getProductStatuses(brand, market = 'ALL') {
  const cacheKey = `${brand}::${market}`;
  if (statusInFlight.has(cacheKey)) return statusInFlight.get(cacheKey);

  const promise = (async () => {
    try {
      const targets = getMcTargets(brand, market);
      if (!targets.length) return [];
      const lists = await Promise.all(
        targets.map(({ merchantId, countryCode }) => fetchProductStatusesForMerchant(merchantId, countryCode))
      );
      // Dedupe by item_id (same offer may appear across sub-accounts)
      const byId = {};
      for (const list of lists) {
        for (const it of list) {
          if (!byId[it.item_id]) byId[it.item_id] = it;
        }
      }
      return Object.values(byId);
    } catch (e) {
      console.error('getProductStatuses error:', e?.message);
      return [];
    } finally {
      statusInFlight.delete(cacheKey);
    }
  })();

  statusInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Sale prices via ProductView ──────────────────────────
// Reads sale_price_micros + sale_price_effective_date alongside regular price.
async function fetchSalePricesForMerchant(merchantId, countryCode = null) {
  const cacheKey = `${merchantId}::${countryCode || 'ALL'}`;
  const cached = promoCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < PROMO_CACHE_TTL) return cached.promos;

  const auth    = getOAuth2Client();
  const content = google.content({ version: 'v2.1', auth });

  // NOTE: sale_price_effective_date is not reliably queryable on ProductView v2.1,
  // so we only fetch sale_price_micros and present no dates in the UI (handled
  // client-side as "Pas de date").
  const query = `SELECT product_view.id, product_view.offer_id, product_view.title, product_view.brand, product_view.price_micros, product_view.sale_price_micros, product_view.currency_code FROM ProductView`;

  const promos = {};
  let pageToken;
  let pages = 0;
  let totalRows = 0;
  let withSale  = 0;

  do {
    const reqBody = { query, pageSize: 1000 };
    if (pageToken) reqBody.pageToken = pageToken;

    const res = await content.reports.search({
      merchantId,
      requestBody: reqBody,
    }).catch(e => {
      console.error(`MC sale prices ${merchantId}: API error — ${e?.message || e}`);
      return { data: { results: [] } };
    });

    for (const row of (res.data.results || [])) {
      totalRows++;
      const pv = row.productView;
      if (!pv?.offerId || !pv?.salePriceMicros) continue;
      withSale++;

      if (countryCode) {
        const idParts = (pv.id || '').split(':');
        if (baseCountry(idParts[2]) !== countryCode) continue;
      }

      const existing = promos[pv.offerId];
      const isOnline = (pv.id || '').startsWith('online:');
      if (existing && !isOnline) continue;

      promos[pv.offerId] = {
        title:           pv.title || '',
        brand:           pv.brand || null,
        original_price:  microsToPrice(pv.priceMicros),
        sale_price:      microsToPrice(pv.salePriceMicros),
        currency:        pv.currencyCode || 'EUR',
        promo_start:     null,
        promo_end:       null,
      };
    }

    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < 500);

  console.log(`MC sale prices ${merchantId} country=${countryCode || 'ALL'}: ${totalRows} rows, ${withSale} with sale_price, ${Object.keys(promos).length} matched after country filter`);
  promoCache.set(cacheKey, { promos, ts: Date.now() });
  saveCacheToDisk();
  return promos;
}

export async function getSalePriceMap(brand, market = 'ALL') {
  const cacheKey = `${brand}::${market}`;
  if (promoInFlight.has(cacheKey)) return promoInFlight.get(cacheKey);

  const promise = (async () => {
    try {
      const targets = getMcTargets(brand, market);
      if (!targets.length) return {};
      const maps = await Promise.all(
        targets.map(({ merchantId, countryCode }) => fetchSalePricesForMerchant(merchantId, countryCode))
      );
      return Object.assign({}, ...maps);
    } catch (e) {
      console.error('getSalePriceMap error:', e?.message);
      return {};
    } finally {
      promoInFlight.delete(cacheKey);
    }
  })();

  promoInFlight.set(cacheKey, promise);
  return promise;
}

// ─── Product page URLs via products.list ──────────────────
// product_view (reporting) does not expose `link`, so we use the v2.1 Content
// products.list endpoint. Cached aggressively (7d) — URLs change rarely.
async function fetchProductLinksForMerchant(merchantId, countryCode = null) {
  const cacheKey = `${merchantId}::${countryCode || 'ALL'}`;
  const cached = linkCache.get(cacheKey);
  if (cached && (Date.now() - cached.ts) < LINK_CACHE_TTL) return cached.links;

  const auth    = getOAuth2Client();
  const content = google.content({ version: 'v2.1', auth });

  const links = {};
  let pageToken;
  let pages = 0;
  let totalRows = 0;

  do {
    const params = { merchantId, maxResults: 250 };
    if (pageToken) params.pageToken = pageToken;

    const res = await content.products.list(params).catch(e => {
      console.error(`MC products.list ${merchantId}:`, e?.message || e);
      return { data: { resources: [] } };
    });

    for (const prod of (res.data.resources || [])) {
      totalRows++;
      if (!prod.link) continue;

      // Product id format: "online:fr:FR:88069" — same shape as ProductView.id.
      // Use offerId when populated, otherwise extract from the trailing segment
      // (the v2.1 API has been intermittently dropping offerId in some responses).
      const idParts = (prod.id || '').split(':');
      const offerId = prod.offerId || idParts.slice(3).join(':');
      if (!offerId) continue;

      // Filter by country, accepting custom feed labels like "FR_NEW".
      if (countryCode) {
        if (baseCountry(idParts[2]) !== countryCode) continue;
      }

      // Prefer online channel when both online + local exist for same offer
      const existing = links[offerId];
      const isOnline = (prod.id || '').startsWith('online:');
      if (existing && !isOnline) continue;

      links[offerId] = prod.link;
    }

    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < 1000);

  const matched = Object.keys(links).length;
  console.log(`MC product links ${merchantId} country=${countryCode || 'ALL'}: ${totalRows} rows, ${matched} URLs matched`);
  // Only cache non-empty results — avoids poisoning the 7-day cache if the
  // first fetch returned empty (auth race, transient API error, etc.).
  if (matched > 0) {
    linkCache.set(cacheKey, { links, ts: Date.now() });
    saveCacheToDisk();
  } else {
    console.warn(`MC product links ${merchantId}: 0 URLs — NOT caching, will retry on next request`);
  }
  return links;
}

export async function getProductLinkMap(brand, market = 'ALL') {
  const cacheKey = `${brand}::${market}`;
  if (linkInFlight.has(cacheKey)) return linkInFlight.get(cacheKey);

  const promise = (async () => {
    try {
      const targets = getMcTargets(brand, market);
      if (!targets.length) return {};
      const maps = await Promise.all(
        targets.map(({ merchantId, countryCode }) => fetchProductLinksForMerchant(merchantId, countryCode))
      );
      return Object.assign({}, ...maps);
    } catch (e) {
      console.error('getProductLinkMap error:', e?.message);
      return {};
    } finally {
      linkInFlight.delete(cacheKey);
    }
  })();

  linkInFlight.set(cacheKey, promise);
  return promise;
}
