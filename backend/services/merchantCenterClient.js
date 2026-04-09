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
};

// Returns [{ merchantId, countryCode }] for a given brand + market.
// For market='ALL', returns all accounts with countryCode=null (no country filter).
function getMcTargets(brand, market = 'ALL') {
  if (market !== 'ALL' && MC_MARKET[brand]?.[market]) {
    return [MC_MARKET[brand][market]];
  }
  if (brand === 'ALL') return Object.values(MC_CONFIG).flat().map(id => ({ merchantId: id, countryCode: null }));
  return (MC_CONFIG[brand] ?? []).map(id => ({ merchantId: id, countryCode: null }));
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
const priceCache = new Map();
const pcCache    = new Map();

// In-flight deduplication: concurrent callers share the same pending Promise
// instead of each firing a redundant MC API request (prevents cache stampede).
const priceInFlight = new Map();
const pcInFlight    = new Map();

const PRICE_CACHE_TTL = 60 * 60 * 1000;     // 1h
const PC_CACHE_TTL    = 3 * 60 * 60 * 1000; // 3h

export function clearMcCache() {
  priceCache.clear();
  pcCache.clear();
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
