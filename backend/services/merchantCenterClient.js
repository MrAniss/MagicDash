import { google } from 'googleapis';
import { getOAuth2Client } from '../auth.js';

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

// ─── Caches ───────────────────────────────────────────────
// keyed by `${merchantId}::${countryCode || 'ALL'}`
const priceCache  = new Map();
const pcCache     = new Map();
const statusCache = new Map(); // productstatuses (issues + aggregated_destination_status)
const promoCache  = new Map(); // sale_price info from ProductView

// In-flight deduplication: concurrent callers share the same pending Promise
// instead of each firing a redundant MC API request (prevents cache stampede).
const priceInFlight  = new Map();
const pcInFlight     = new Map();
const statusInFlight = new Map();
const promoInFlight  = new Map();

const PRICE_CACHE_TTL  = 60 * 60 * 1000;     // 1h
const PC_CACHE_TTL     = 3 * 60 * 60 * 1000; // 3h
const STATUS_CACHE_TTL = 60 * 60 * 1000;     // 1h
const PROMO_CACHE_TTL  = 60 * 60 * 1000;     // 1h

export function clearMcCache() {
  priceCache.clear();
  pcCache.clear();
  statusCache.clear();
  promoCache.clear();
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
      // product_view.id format: "channel:lang:COUNTRY:offerId"
      if (countryCode) {
        const idParts = (pv.id || '').split(':');
        const rowCountry = idParts[2] || '';
        if (rowCountry !== countryCode) continue;
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
      if (countryCode && rowCountry !== countryCode) continue;

      const offerId = idParts.slice(3).join(':') || ps.productId;
      const issues = (ps.itemLevelIssues || []).map(i => ({
        type:        classifyIssue({ code: i.code, description: i.description, attributeName: i.attributeName }),
        code:        i.code || null,
        description: i.description || i.code || '',
        attribute:   i.attributeName || null,
        severity:    (i.servability || '').toLowerCase() || 'warning',
        destination: i.destination || null,
      }));

      // Derive aggregated status from destinationStatuses (first entry) — API v2.1
      // returns either a string field `status` or an approvedCountries array.
      const ds = ps.destinationStatuses?.[0] || {};
      let status = 'pending';
      if (ds.status)                         status = normalizeAgg(ds.status);
      else if (ds.approvedCountries?.length) status = 'active';
      else if (ds.disapprovedCountries?.length) status = 'disapproved';
      // Issue-driven override
      if (issues.some(i => i.severity === 'disapproved')) status = 'disapproved';
      else if (issues.length > 0 && status === 'active')   status = 'limited';

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
        const rowCountry = idParts[2] || '';
        if (rowCountry !== countryCode) continue;
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
