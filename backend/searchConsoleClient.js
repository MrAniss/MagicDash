import { google } from 'googleapis';
import { getOAuth2Client } from './auth.js';
import { GSC_PROPERTIES } from './config/gscProperties.js';
import { BRAND_PATTERNS, classifyQuery } from './config/brandKeywords.js';

const searchconsole = google.searchconsole('v1');

const cache = new Map();
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3h

export function clearGscCache() {
  cache.clear();
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (entry && (Date.now() - entry.ts) < CACHE_TTL) return entry.data;
  cache.delete(key);
  return null;
}

function setCache(key, data) {
  cache.set(key, { data, ts: Date.now() });
}

// Fetch raw GSC rows with dimensions [query, date] filtered by country.
async function fetchRawRows(brandLabel, from, to) {
  const conf = GSC_PROPERTIES[brandLabel];
  if (!conf) throw new Error(`Unknown GSC brand: ${brandLabel}`);

  const auth = getOAuth2Client();
  const all = [];
  const PAGE_SIZE = 25000;
  let startRow = 0;

  while (true) {
    const resp = await searchconsole.searchanalytics.query({
      auth,
      siteUrl: conf.property,
      requestBody: {
        startDate: from,
        endDate: to,
        dimensions: ['query', 'date'],
        rowLimit: PAGE_SIZE,
        startRow,
        dimensionFilterGroups: [{
          filters: [{ dimension: 'country', operator: 'equals', expression: conf.country }],
        }],
      },
    });
    const rows = resp.data.rows || [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
    startRow += PAGE_SIZE;
    if (startRow > 250000) break; // safety
  }
  return all;
}

/**
 * Returns aggregated GSC metrics grouped by date with brand-classification breakdown.
 * Each item: {
 *   date, brand_impressions, brand_clicks,
 *   brand_exact_impressions, brand_variant_impressions, brand_plus_kw_impressions,
 *   brand_exact_clicks, brand_variant_clicks, brand_plus_kw_clicks,
 *   non_brand_impressions, non_brand_clicks,
 *   seo_brand_positions_sum, seo_brand_positions_weight (for weighted avg)
 * }
 */
export async function getGscBrandByDate(brandLabel, from, to) {
  const cacheKey = ['gsc-daily', brandLabel, from, to].join('|');
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const patterns = BRAND_PATTERNS[brandLabel];
  if (!patterns) throw new Error(`No brand patterns for: ${brandLabel}`);

  const rawRows = await fetchRawRows(brandLabel, from, to);

  const byDate = {};
  for (const r of rawRows) {
    const [query, date] = r.keys || [];
    if (!date) continue;
    const category = classifyQuery(query, patterns);
    const imp = Number(r.impressions || 0);
    const clk = Number(r.clicks || 0);
    const pos = Number(r.position || 0);

    if (!byDate[date]) {
      byDate[date] = {
        date,
        brand_impressions: 0,
        brand_clicks: 0,
        brand_exact_impressions: 0,
        brand_exact_clicks: 0,
        brand_variant_impressions: 0,
        brand_variant_clicks: 0,
        brand_plus_kw_impressions: 0,
        brand_plus_kw_clicks: 0,
        non_brand_impressions: 0,
        non_brand_clicks: 0,
        _pos_weighted: 0,
        _pos_weight: 0,
      };
    }
    const bucket = byDate[date];

    if (category === 'NON_BRAND') {
      bucket.non_brand_impressions += imp;
      bucket.non_brand_clicks += clk;
    } else {
      bucket.brand_impressions += imp;
      bucket.brand_clicks += clk;
      bucket._pos_weighted += pos * imp;
      bucket._pos_weight += imp;
      if (category === 'BRAND_EXACT') {
        bucket.brand_exact_impressions += imp;
        bucket.brand_exact_clicks += clk;
      } else if (category === 'BRAND_VARIANT') {
        bucket.brand_variant_impressions += imp;
        bucket.brand_variant_clicks += clk;
      } else if (category === 'BRAND_PLUS_KW') {
        bucket.brand_plus_kw_impressions += imp;
        bucket.brand_plus_kw_clicks += clk;
      }
    }
  }

  const result = Object.values(byDate)
    .map(b => ({
      ...b,
      seo_brand_avg_position: b._pos_weight > 0 ? b._pos_weighted / b._pos_weight : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  setCache(cacheKey, result);
  console.log(`GSC API: ${rawRows.length} rows fetched (${brandLabel}, ${from} to ${to})`);
  return result;
}
