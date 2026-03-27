import { google } from 'googleapis';
import { getOAuth2Client } from '../auth.js';

// ─── Merchant Center IDs ──────────────────────────────────
// Cocooncenter has one MC account per market
const MC_CONFIG = {
  COCOONCENTER: [
    '7284268',    // cocooncenter.com (FR)
    '134179870',  // cocooncenter.be
    '279126399',  // cocooncenter.co.uk
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

// ─── Caches ───────────────────────────────────────────────
const priceCache = new Map(); // merchantId -> { prices, ts }
const pcCache    = new Map(); // brand -> { data, ts }

const PRICE_CACHE_TTL = 60 * 60 * 1000;     // 1h
const PC_CACHE_TTL    = 3 * 60 * 60 * 1000; // 3h

export function clearMcCache() {
  priceCache.clear();
  pcCache.clear();
}

function getMcIdsForBrand(brand) {
  if (brand === 'ALL') return Object.values(MC_CONFIG).flat();
  return MC_CONFIG[brand] ?? [];
}

// ─── Catalog prices via products.list ────────────────────

// ─── Catalog prices via ProductView report ────────────────
// Independent from competitiveness — returns price for ALL products

async function fetchProductPricesForMerchant(merchantId) {
  const cached = priceCache.get(merchantId);
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
      prices[pv.offerId] = {
        price:    Math.round(Number(pv.priceMicros) / 10000) / 100,
        currency: pv.currencyCode || 'EUR',
      };
    }

    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < 500);

  console.log(`MC product prices: ${Object.keys(prices).length} products for merchant ${merchantId}`);
  priceCache.set(merchantId, { prices, ts: Date.now() });
  return prices;
}

export async function getPriceMap(brand) {
  try {
    const ids = getMcIdsForBrand(brand);
    if (!ids.length) return {};
    const maps   = await Promise.all(ids.map(id => fetchProductPricesForMerchant(id)));
    return Object.assign({}, ...maps);
  } catch (e) {
    console.error('getPriceMap error:', e?.message);
    return {};
  }
}

// ─── Price competitiveness via reports.search ─────────────

// Normalize offer ID: 'online:fr:FR:REF123' -> 'REF123'
function normalizeOfferId(offerId) {
  if (!offerId) return offerId;
  const parts = offerId.split(':');
  return parts.length >= 4 ? parts.slice(3).join(':') : offerId;
}

function computeCompetitiveness(ourMicros, benchmarkMicros) {
  const our       = ourMicros       / 1_000_000;
  const benchmark = benchmarkMicros / 1_000_000;
  const delta     = (our - benchmark) / benchmark;
  return {
    our_price:       Math.round(our       * 100) / 100,
    benchmark_price: Math.round(benchmark * 100) / 100,
    delta_pct:       Math.round(delta * 10000) / 100,
    delta_eur:       Math.round((our - benchmark) * 100) / 100,
    status: delta < -0.05 ? 'COMPETITIVE' : delta > 0.05 ? 'EXPENSIVE' : 'ON_PAR',
  };
}

async function fetchPriceCompForMerchant(merchantId) {
  const auth    = getOAuth2Client();
  const content = google.content({ version: 'v2.1', auth });

  // Mandatory fields: product_view.id, price_competitiveness.country_code
  const query = `SELECT product_view.id, product_view.offer_id, product_view.price_micros, product_view.currency_code, price_competitiveness.country_code, price_competitiveness.benchmark_price_micros, price_competitiveness.benchmark_price_currency_code FROM PriceCompetitivenessProductView`;

  const results = {};
  let pageToken;
  let pages = 0;

  do {
    const reqBody = { query, pageSize: 1000 };
    if (pageToken) reqBody.pageToken = pageToken;

    const res = await content.reports.search({
      merchantId,
      requestBody: reqBody,
    }).catch(e => {
      console.error(`MC price comp ${merchantId}:`, e?.message || e);
      return { data: { results: [] } };
    });

    for (const row of (res.data.results || [])) {
      const pv = row.productView;
      const pc = row.priceCompetitiveness;
      if (!pv?.offerId || !pc?.benchmarkPriceMicros) continue;
      const ourMicros       = Number(pv.priceMicros       || 0);
      const benchmarkMicros = Number(pc.benchmarkPriceMicros || 0);
      if (!ourMicros || !benchmarkMicros) continue;
      // Use offerId directly (already normalized, e.g. "REF123")
      const itemId = pv.offerId;
      // Keep highest-revenue entry if duplicate (last write wins here — acceptable)
      results[itemId] = computeCompetitiveness(ourMicros, benchmarkMicros);
    }

    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < 200);

  console.log(`MC price comp: ${Object.keys(results).length} products for merchant ${merchantId}`);
  return results;
}

export async function getPriceCompetitivenessData(brand) {
  const cached = pcCache.get(brand);
  if (cached && (Date.now() - cached.ts) < PC_CACHE_TTL) return cached.data;

  try {
    const ids = getMcIdsForBrand(brand);
    if (!ids.length) return {};
    const maps   = await Promise.all(ids.map(id => fetchPriceCompForMerchant(id)));
    const merged = Object.assign({}, ...maps);
    console.log(`MC price comp total: ${Object.keys(merged).length} products for brand ${brand}`);
    pcCache.set(brand, { data: merged, ts: Date.now() });
    return merged;
  } catch (e) {
    console.error('getPriceCompetitivenessData error:', e?.message);
    return {};
  }
}
