import { GoogleAdsApi } from 'google-ads-api';
import { getOAuth2Client } from './auth.js';
import { BRANDS, MCC_ID } from './config/accounts.js';

// ─── Cache ─────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function clearCache() {
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

// ─── Google Ads API setup ──────────────────────────────

function getApi() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });
}

function getRefreshToken() {
  const client = getOAuth2Client();
  const creds = client.credentials;
  if (!creds?.refresh_token) {
    throw new Error('NOT_AUTHENTICATED');
  }
  return creds.refresh_token;
}

function getCustomer(api, customerId, loginCustomerId, refreshToken) {
  return api.Customer({
    customer_id: customerId.replace(/-/g, ''),
    login_customer_id: loginCustomerId.replace(/-/g, ''),
    refresh_token: refreshToken,
  });
}

// ─── GAQL builder ──────────────────────────────────────

function buildGAQL(dateFrom, dateTo, includeComarket) {
  let where = `segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`;
  if (!includeComarket) {
    where += ` AND campaign.name NOT LIKE '%comarket%' AND campaign.name NOT LIKE '%Comarket%' AND campaign.name NOT LIKE '%COMARKET%'`;
  }

  return `
    SELECT
      segments.date,
      customer.descriptive_name,
      customer.id,
      customer.currency_code,
      campaign.id,
      campaign.name,
      campaign.status,
      campaign.advertising_channel_type,
      campaign.bidding_strategy_type,
      metrics.impressions,
      metrics.clicks,
      metrics.ctr,
      metrics.cost_micros,
      metrics.conversions,
      metrics.conversions_value,
      metrics.search_click_share
    FROM campaign
    WHERE ${where}
  `;
}

// ─── Row normalizer ────────────────────────────────────

function mapChannelType(type) {
  if (!type) return 'Other';
  switch (type) {
    case 2: case 'SEARCH': return 'Search';
    case 4: case 'SHOPPING': return 'Shopping';
    case 9: case 'PERFORMANCE_MAX': return 'PMax';
    case 3: case 'DISPLAY': return 'Display';
    case 6: case 'VIDEO': return 'Video';
    case 12: case 'DISCOVERY':
    case 13: case 'DEMAND_GEN': return 'Demand Gen';
    default: return 'Other';
  }
}

function mapStatus(status) {
  switch (status) {
    case 2: case 'ENABLED': return 'Active';
    case 3: case 'PAUSED': return 'Paused';
    case 4: case 'REMOVED': return 'Removed';
    default: return 'Paused';
  }
}

function normalizeRow(row, brand, brandLabel, market) {
  const costMicros = Number(row.metrics?.cost_micros || 0);
  const cost = costMicros / 1e6;
  const convValue = Number(row.metrics?.conversions_value || 0);
  const campaignName = row.campaign?.name || '';

  return {
    date: row.segments?.date || '',
    account: row.customer?.descriptive_name || '',
    brand,
    brandLabel,
    market,
    accountId: String(row.customer?.id || ''),
    campaign: campaignName,
    campaignId: String(row.campaign?.id || ''),
    campaign_status: mapStatus(row.campaign?.status),
    campaign_type: mapChannelType(row.campaign?.advertising_channel_type),
    bidType: String(row.campaign?.bidding_strategy_type || ''),
    impressions: Number(row.metrics?.impressions || 0),
    clicks: Number(row.metrics?.clicks || 0),
    ctr: Number(row.metrics?.ctr || 0) * 100,
    cost,
    conversion_value: convValue,
    conversions: Number(row.metrics?.conversions || 0),
    roas: cost > 0 ? convValue / cost : 0,
    clickShare: Number(row.metrics?.search_click_share || 0),
    comarket: campaignName.toLowerCase().includes('comarket'),
  };
}

// ─── Query functions ───────────────────────────────────

async function queryAccount(api, accountId, loginCustomerId, gaql, refreshToken, brand, brandLabel, market) {
  const customer = getCustomer(api, accountId, loginCustomerId, refreshToken);
  const results = await customer.query(gaql);
  return results.map(row => normalizeRow(row, brand, brandLabel, market));
}

async function queryAllCocooncenter(api, refreshToken, dateFrom, dateTo, includeComarket) {
  const gaql = buildGAQL(dateFrom, dateTo, includeComarket);
  const accounts = BRANDS.COCOONCENTER.accounts;

  const results = await Promise.all(
    accounts.map(acc =>
      queryAccount(api, acc.id, MCC_ID, gaql, refreshToken, 'COCOONCENTER', 'Cocooncenter', acc.market)
        .catch(err => {
          console.error(`Error querying CC ${acc.market} (${acc.id}):`, err.message);
          return [];
        })
    )
  );

  return results.flat();
}

function findBrandKey(accountDef) {
  return Object.keys(BRANDS).find(k => BRANDS[k] === accountDef);
}

async function queryStandaloneAccount(api, refreshToken, accountDef, dateFrom, dateTo, includeComarket) {
  const gaql = buildGAQL(dateFrom, dateTo, includeComarket);
  const acc = accountDef.accounts[0];
  return queryAccount(api, acc.id, acc.id, gaql, refreshToken, findBrandKey(accountDef), accountDef.name, acc.market)
    .catch(err => {
      console.error(`Error querying ${accountDef.name}:`, err.message);
      return [];
    });
}

// ─── Public API (same signatures as sheetsReader) ──────

export async function getRows({ brand = 'ALL', market = 'ALL', from, to, campaignType, includeComarket = false }) {
  const cacheKey = ['rows', brand, from, to, String(includeComarket)].join('|');
  let allRows = getFromCache(cacheKey);

  if (!allRows) {
    const refreshToken = getRefreshToken();
    const api = getApi();

    const promises = [];

    if (brand === 'ALL' || brand === 'COCOONCENTER') {
      promises.push(queryAllCocooncenter(api, refreshToken, from, to, includeComarket));
    }
    if (brand === 'ALL' || brand === 'PASCAL_COSTE') {
      promises.push(queryStandaloneAccount(api, refreshToken, BRANDS.PASCAL_COSTE, from, to, includeComarket));
    }
    if (brand === 'ALL' || brand === 'PARAPHARMACIE_LAFAYETTE') {
      promises.push(queryStandaloneAccount(api, refreshToken, BRANDS.PARAPHARMACIE_LAFAYETTE, from, to, includeComarket));
    }

    const results = await Promise.all(promises);
    allRows = results.flat().sort((a, b) => a.date.localeCompare(b.date));

    setCache(cacheKey, allRows);
    console.log(`Google Ads API: ${allRows.length} rows fetched (brand=${brand}, ${from} to ${to})`);
  }

  // Apply post-fetch filters
  let filtered = allRows;
  if (market && market !== 'ALL') {
    filtered = filtered.filter(r => r.market === market);
  }
  if (campaignType && campaignType !== 'ALL') {
    if (campaignType === 'DSA') {
      filtered = filtered.filter(r => r.campaign.toLowerCase().includes('dsa'));
    } else {
      filtered = filtered.filter(r => r.campaign_type === campaignType);
    }
  }
  return filtered;
}

export async function getComarketRows({ from, to }) {
  const refreshToken = getRefreshToken();
  const api = getApi();

  // Query FR Cocooncenter with comarket included (override GAQL filter)
  const gaql = buildGAQL(from, to, true);
  const frAccount = BRANDS.COCOONCENTER.accounts.find(a => a.market === 'FR');
  const rows = await queryAccount(api, frAccount.id, MCC_ID, gaql, refreshToken, 'COCOONCENTER', 'Cocooncenter', 'FR');

  return rows.filter(r => r.comarket);
}
