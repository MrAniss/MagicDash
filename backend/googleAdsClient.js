import { GoogleAdsApi } from 'google-ads-api';
import { getOAuth2Client } from './auth.js';
import { BRANDS, MCC_ID, getMarginConversionActionId } from './config/accounts.js';

// ─── Cache ─────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

export function clearCache() {
  cache.clear();
  compCache.clear();
  shoppingCache.clear();
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

export function getApi() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
  });
}

export function getRefreshToken() {
  const client = getOAuth2Client();
  const creds = client.credentials;
  if (!creds?.refresh_token) {
    throw new Error('NOT_AUTHENTICATED');
  }
  return creds.refresh_token;
}

export function getCustomer(api, customerId, loginCustomerId, refreshToken) {
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
      metrics.search_impression_share,
      metrics.search_rank_lost_impression_share,
      metrics.search_budget_lost_impression_share,
      metrics.absolute_top_impression_percentage,
      metrics.top_impression_percentage,
      metrics.search_click_share
    FROM campaign
    WHERE ${where}
  `;
}

// ─── Row normalizer ────────────────────────────────────

function mapChannelType(type) {
  if (!type) return 'Other';
  const t = String(type).toUpperCase();
  if (t === '2' || t === 'SEARCH') return 'Search';
  if (t === '4' || t === 'SHOPPING') return 'Shopping';
  if (t === '9' || t === '10' || t === 'PERFORMANCE_MAX' || t === 'PMAX') return 'Performance Max';
  if (t === '3' || t === 'DISPLAY') return 'Display';
  if (t === '6' || t === 'VIDEO') return 'Video';
  if (t === '12' || t === 'DISCOVERY') return 'Discovery';
  if (t === '13' || t === 'DEMAND_GEN') return 'Demand Gen';
  return t.charAt(0) + t.slice(1).toLowerCase().replace(/_/g, ' ');
}

function mapStatus(status) {
  switch (status) {
    case 2: case 'ENABLED': return 'Active';
    case 3: case 'PAUSED': return 'Paused';
    case 4: case 'REMOVED': return 'Removed';
    default: return 'Paused';
  }
}

function parsePct(val) {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return 0;
  
  const clean = val.trim();
  if (clean === '--' || clean === '' || clean === 'UNSPECIFIED') return 0;
  if (clean.includes('< 10%')) return 0.05;
  if (clean.includes('> 90%')) return 0.95;
  
  const hasPct = clean.includes('%');
  const num = parseFloat(clean.replace('%', '').replace(',', '.'));
  if (isNaN(num)) return 0;
  
  return hasPct ? num / 100 : num;
}

function normalizeRow(row, brand, brandLabel, market) {
  const costMicros = Number(row.metrics?.cost_micros || 0);
  const cost = costMicros / 1e6;
  const convValue = Number(row.metrics?.conversions_value || 0);
  const campaignName = row.campaign?.name || '';

  const is = parsePct(row.metrics?.search_impression_share);
  const absTop = parsePct(row.metrics?.absolute_top_impression_percentage);
  const finalIs = (is === 0 && absTop > 0) ? absTop : is;

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
    clickShare: parsePct(row.metrics?.search_click_share),
    searchImpressionShare: finalIs,
    searchRankLostImpressionShare: parsePct(row.metrics?.search_rank_lost_impression_share),
    searchBudgetLostImpressionShare: parsePct(row.metrics?.search_budget_lost_impression_share),
    absoluteTopImpressionPercentage: absTop,
    topImpressionPercentage: parsePct(row.metrics?.top_impression_percentage),
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
    if (brand === 'ALL' || brand === 'LASANTE') {
      promises.push(queryStandaloneAccount(api, refreshToken, BRANDS.LASANTE, from, to, includeComarket));
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

// ─── Signal rows for recommendation engine ─────────────

function buildSignalGAQL(dateFrom, dateTo) {
  return `
    SELECT
      customer.id,
      customer.descriptive_name,
      campaign.id,
      campaign.name,
      campaign.advertising_channel_type,
      campaign.target_roas.target_roas,
      metrics.cost_micros,
      metrics.conversions_value,
      metrics.search_click_share,
      metrics.clicks,
      metrics.impressions
    FROM campaign
    WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
      AND campaign.status = 'ENABLED'
  `;
}

function normalizeSignalRow(row, brand, brandLabel, market) {
  const costMicros = Number(row.metrics?.cost_micros || 0);
  const cost = costMicros / 1e6;
  const convValue = Number(row.metrics?.conversions_value || 0);
  const targetRoas = Number(row.campaign?.target_roas?.target_roas || 0);
  return {
    brand, brandLabel, market,
    campaign: row.campaign?.name || '',
    campaignId: String(row.campaign?.id || ''),
    campaignType: mapChannelType(row.campaign?.advertising_channel_type),
    cost,
    conversions_value: convValue,
    roas: cost > 0 ? convValue / cost : 0,
    clickShare: Number(row.metrics?.search_click_share || 0),
    clicks: Number(row.metrics?.clicks || 0),
    impressions: Number(row.metrics?.impressions || 0),
    targetRoas,
  };
}

async function queryAccountSignals(api, accountId, loginCustomerId, gaql, refreshToken, brand, brandLabel, market) {
  const customer = getCustomer(api, accountId, loginCustomerId, refreshToken);
  const results = await customer.query(gaql);
  return results.map(row => normalizeSignalRow(row, brand, brandLabel, market));
}

export async function getSignalRows(brand, dateFrom, dateTo) {
  const cacheKey = ['signals', brand, dateFrom, dateTo].join('|');
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const refreshToken = getRefreshToken();
  const api = getApi();
  const gaql = buildSignalGAQL(dateFrom, dateTo);

  let rows = [];

  if (brand === 'COCOONCENTER') {
    const results = await Promise.all(
      BRANDS.COCOONCENTER.accounts.map(acc =>
        queryAccountSignals(api, acc.id, MCC_ID, gaql, refreshToken, 'COCOONCENTER', 'Cocooncenter', acc.market)
          .catch(() => [])
      )
    );
    rows = results.flat();
  } else if (brand === 'PASCAL_COSTE') {
    const acc = BRANDS.PASCAL_COSTE.accounts[0];
    rows = await queryAccountSignals(api, acc.id, acc.id, gaql, refreshToken, 'PASCAL_COSTE', 'Pascal Coste Shopping', acc.market)
      .catch(() => []);
  } else if (brand === 'PARAPHARMACIE_LAFAYETTE') {
    const acc = BRANDS.PARAPHARMACIE_LAFAYETTE.accounts[0];
    rows = await queryAccountSignals(api, acc.id, acc.id, gaql, refreshToken, 'PARAPHARMACIE_LAFAYETTE', 'Parapharmacie Lafayette', acc.market)
      .catch(() => []);
  } else if (brand === 'LASANTE') {
    const acc = BRANDS.LASANTE.accounts[0];
    if (acc) {
      rows = await queryAccountSignals(api, acc.id, acc.id, gaql, refreshToken, 'LASANTE', 'LaSante.net', acc.market)
        .catch(() => []);
    }
  }

  setCache(cacheKey, rows);
  return rows;
}

// ─── Campaign audit (7d / 30d / 90d per campaign) ──────

const auditCache = new Map();
const AUDIT_CACHE_TTL = 30 * 60 * 1000; // 30 min

function auditSubDays(n) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function buildAuditGAQL(dateFrom, dateTo) {
  return `SELECT
    campaign.id,
    campaign.name,
    campaign.advertising_channel_type,
    campaign.bidding_strategy_type,
    campaign.target_roas.target_roas,
    campaign.maximize_conversion_value.target_roas,
    metrics.cost_micros,
    metrics.conversions_value,
    metrics.conversions,
    metrics.clicks,
    metrics.impressions,
    metrics.search_click_share
  FROM campaign
  WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    AND campaign.status = 'ENABLED'`;
}

function buildBudgetGAQL() {
  return `SELECT
    campaign.id,
    campaign_budget.amount_micros
  FROM campaign
  WHERE campaign.status = 'ENABLED'`;
}

function normalizeAuditRow(row, brand, brandLabel, market, period) {
  const cost = Number(row.metrics?.cost_micros || 0) / 1e6;
  const convValue = Number(row.metrics?.conversions_value || 0);
  const clicks = Number(row.metrics?.clicks || 0);
  const impressions = Number(row.metrics?.impressions || 0);
  const clickShare = Number(row.metrics?.search_click_share || 0);
  const conversions = Number(row.metrics?.conversions || 0);
  const budgetDaily = 0; // fetched separately via buildBudgetGAQL
  const targetRoas = Number(row.campaign?.target_roas?.target_roas || 0)
    || Number(row.campaign?.maximize_conversion_value?.target_roas || 0);
  return {
    period, brand, brandLabel, market,
    campaignId: String(row.campaign?.id || ''),
    campaign: row.campaign?.name || '',
    campaignType: mapChannelType(row.campaign?.advertising_channel_type),
    bidStrategy: String(row.campaign?.bidding_strategy_type || ''),
    targetRoas, budgetDaily,
    cost, convValue, conversions, clicks, impressions, clickShare,
    roas: cost > 0 ? convValue / cost : 0,
  };
}

async function queryAccountAudit(api, accountId, loginCustomerId, gaql, refreshToken, brand, brandLabel, market, period) {
  const customer = getCustomer(api, accountId, loginCustomerId, refreshToken);
  const results = await customer.query(gaql).catch(e => {
    const msg = e?.message || e?.details?.[0]?.message || JSON.stringify(e);
    console.error(`Audit ${market}/${period} [${accountId}]:`, msg);
    return [];
  });
  return results.map(r => normalizeAuditRow(r, brand, brandLabel, market, period));
}

export async function getCampaignAuditData(brand) {
  const cacheKey = `audit|${brand}`;
  const entry = auditCache.get(cacheKey);
  if (entry && (Date.now() - entry.ts) < AUDIT_CACHE_TTL) return entry.data;
  auditCache.delete(cacheKey);

  const todayStr = auditSubDays(0);
  const from7  = auditSubDays(7);
  const from30 = auditSubDays(30);
  const from90 = auditSubDays(90);

  const refreshToken = getRefreshToken();
  const api = getApi();

  let accountList = [];
  if (brand === 'ALL') {
    accountList = [
      ...BRANDS.COCOONCENTER.accounts.map(a => ({ ...a, brand: 'COCOONCENTER', brandLabel: 'Cocooncenter', loginId: MCC_ID })),
      { ...BRANDS.PASCAL_COSTE.accounts[0],           brand: 'PASCAL_COSTE',           brandLabel: 'Pascal Coste Shopping',   loginId: BRANDS.PASCAL_COSTE.accounts[0].id },
      { ...BRANDS.PARAPHARMACIE_LAFAYETTE.accounts[0], brand: 'PARAPHARMACIE_LAFAYETTE', brandLabel: 'Parapharmacie Lafayette', loginId: BRANDS.PARAPHARMACIE_LAFAYETTE.accounts[0].id },
    ];
    if (BRANDS.LASANTE.accounts[0]) {
      accountList.push({ ...BRANDS.LASANTE.accounts[0], brand: 'LASANTE', brandLabel: 'LaSante.net', loginId: BRANDS.LASANTE.accounts[0].id });
    }
  } else if (brand === 'COCOONCENTER') {
    accountList = BRANDS.COCOONCENTER.accounts.map(a => ({ ...a, brand: 'COCOONCENTER', brandLabel: 'Cocooncenter', loginId: MCC_ID }));
  } else if (brand === 'PASCAL_COSTE') {
    const a = BRANDS.PASCAL_COSTE.accounts[0];
    accountList = [{ ...a, brand: 'PASCAL_COSTE', brandLabel: 'Pascal Coste Shopping', loginId: a.id }];
  } else if (brand === 'PARAPHARMACIE_LAFAYETTE') {
    const a = BRANDS.PARAPHARMACIE_LAFAYETTE.accounts[0];
    accountList = [{ ...a, brand: 'PARAPHARMACIE_LAFAYETTE', brandLabel: 'Parapharmacie Lafayette', loginId: a.id }];
  } else if (brand === 'LASANTE') {
    const a = BRANDS.LASANTE.accounts[0];
    if (a) accountList = [{ ...a, brand: 'LASANTE', brandLabel: 'LaSante.net', loginId: a.id }];
  }

  // All accounts × 3 periods + budget query in parallel
  const budgetGAQL = buildBudgetGAQL();
  const promises = accountList.flatMap(acc => [
    queryAccountAudit(api, acc.id, acc.loginId, buildAuditGAQL(from7,  todayStr), refreshToken, acc.brand, acc.brandLabel, acc.market, '7d'),
    queryAccountAudit(api, acc.id, acc.loginId, buildAuditGAQL(from30, todayStr), refreshToken, acc.brand, acc.brandLabel, acc.market, '30d'),
    queryAccountAudit(api, acc.id, acc.loginId, buildAuditGAQL(from90, todayStr), refreshToken, acc.brand, acc.brandLabel, acc.market, '90d'),
    // budget query (no date segment)
    (async () => {
      const customer = getCustomer(api, acc.id, acc.loginId, refreshToken);
      const rows = await customer.query(budgetGAQL).catch(() => []);
      const map = {};
      for (const r of rows) {
        const id = String(r.campaign?.id || '');
        if (id) map[id] = Number(r.campaign_budget?.amount_micros || 0) / 1e6;
      }
      return { _budgetMap: true, market: acc.market, map };
    })(),
  ]);

  const results = await Promise.all(promises);

  // Separate budget maps from metric rows
  const budgetMap = {};
  const allRows = [];
  for (const r of results.flat()) {
    if (r?._budgetMap) {
      Object.assign(budgetMap, r.map);
    } else {
      allRows.push(r);
    }
  }

  // Merge into per-campaign objects
  const campaigns = {};
  for (const row of allRows) {
    const id = row.campaignId;
    if (!id) continue;
    if (!campaigns[id]) {
      campaigns[id] = {
        campaign_id: id, campaign_name: row.campaign, campaign_type: row.campaignType,
        market: row.market, brand: row.brand, brandLabel: row.brandLabel,
        bid_strategy: row.bidStrategy, target_roas: row.targetRoas, budget_daily: 0,
      };
    }
    const p = row.period;
    campaigns[id][`cost_${p}`]        = (campaigns[id][`cost_${p}`] || 0) + row.cost;
    campaigns[id][`conv_value_${p}`]  = (campaigns[id][`conv_value_${p}`] || 0) + row.convValue;
    campaigns[id][`conversions_${p}`] = (campaigns[id][`conversions_${p}`] || 0) + row.conversions;
    campaigns[id][`clicks_${p}`]      = (campaigns[id][`clicks_${p}`] || 0) + row.clicks;
    campaigns[id][`impressions_${p}`] = (campaigns[id][`impressions_${p}`] || 0) + row.impressions;
    if (row.clickShare > 0) campaigns[id][`click_share_${p}`] = row.clickShare;
    if (row.targetRoas > 0) campaigns[id].target_roas = row.targetRoas;
  }

  // Inject budget from budget map
  for (const [id, c] of Object.entries(campaigns)) {
    if (budgetMap[id] > 0) c.budget_daily = budgetMap[id];
  }

  // Compute derived ROAS fields
  const list = Object.values(campaigns).map(c => ({
    ...c,
    roas_7d:  c.cost_7d  > 0 ? Math.round((c.conv_value_7d  / c.cost_7d)  * 100) / 100 : 0,
    roas_30d: c.cost_30d > 0 ? Math.round((c.conv_value_30d / c.cost_30d) * 100) / 100 : 0,
    roas_90d: c.cost_90d > 0 ? Math.round((c.conv_value_90d / c.cost_90d) * 100) / 100 : 0,
    clicks_30d_daily: c.clicks_30d > 0 ? c.clicks_30d / 30 : 0,
  }));

  auditCache.set(cacheKey, { data: list, ts: Date.now() });
  return list;
}

export function clearAuditCache() { auditCache.clear(); }

// ─── Shopping ────────────────────────────────────────────

const shoppingCache = new Map();
const shoppingInFlight = new Map();
const SHOPPING_CACHE_TTL = 30 * 60 * 1000;

function buildShoppingGAQL(dateFrom, dateTo) {
  return `SELECT
    segments.product_item_id,
    segments.product_title,
    segments.product_brand,
    segments.product_category_level1,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros,
    metrics.conversions,
    metrics.conversions_value
  FROM shopping_performance_view
  WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`;
}

function normalizeShoppingRow(row, brand, brandLabel, market) {
  const cost = Number(row.metrics?.cost_micros || 0) / 1e6;
  const seg = row.segments || {};
  return {
    brand, brandLabel, market,
    item_id: String(seg.product_item_id || ''),
    title: String(seg.product_title || ''),
    product_brand: String(row.segments?.product_brand || ''),
    category_l1: String(row.segments?.product_category_level1 || ''),
    impressions: Number(row.metrics?.impressions || 0),
    clicks: Number(row.metrics?.clicks || 0),
    cost,
    conversions: Number(row.metrics?.conversions || 0),
    revenue: Number(row.metrics?.conversions_value || 0),
  };
}

async function queryAccountShopping(api, accountId, loginCustomerId, gaql, refreshToken, brand, brandLabel, market) {
  const customer = getCustomer(api, accountId, loginCustomerId, refreshToken);
  const results = await customer.query(gaql).catch(e => {
    const msg = e?.message || e?.details?.[0]?.message || JSON.stringify(e);
    console.error(`Shopping ${market} [${accountId}]:`, msg);
    return [];
  });
  return results.map(r => normalizeShoppingRow(r, brand, brandLabel, market));
}

export async function getShoppingData(brand, market, from, to) {
  const bKey = (brand || '').toUpperCase();
  const cacheKey = `shopping|${bKey}|${market}|${from}|${to}`;
  const entry = shoppingCache.get(cacheKey);
  if (entry && (Date.now() - entry.ts) < SHOPPING_CACHE_TTL) return entry.data;
  shoppingCache.delete(cacheKey);

  // In-flight dedup: concurrent callers share the same pending Promise instead
  // of each firing a redundant Google Ads query (prevents cache stampede on
  // cold cache when 3-4 shopping endpoints fire in parallel).
  if (shoppingInFlight.has(cacheKey)) return shoppingInFlight.get(cacheKey);

  const promise = (async () => {
    try {
      console.log(`getShoppingData fetching: brand=${brand}, market=${market}, from=${from}, to=${to}`);
      const refreshToken = getRefreshToken();
      const api = getApi();
      const gaql = buildShoppingGAQL(from, to);

      const accountList = [];
      if (bKey === 'COCOONCENTER' || bKey === 'ALL') {
        BRANDS.COCOONCENTER.accounts
          .filter(a => market === 'ALL' || a.market === market)
          .forEach(a => accountList.push({ ...a, brand: 'COCOONCENTER', brandLabel: 'Cocooncenter', loginId: MCC_ID }));
      }
      if (bKey === 'PASCAL_COSTE' || bKey === 'ALL') {
        const a = BRANDS.PASCAL_COSTE.accounts[0];
        if (market === 'ALL' || a.market === market)
          accountList.push({ ...a, brand: 'PASCAL_COSTE', brandLabel: 'Pascal Coste Shopping', loginId: a.id });
      }
      if (bKey === 'PARAPHARMACIE_LAFAYETTE' || bKey === 'ALL') {
        const a = BRANDS.PARAPHARMACIE_LAFAYETTE.accounts[0];
        if (market === 'ALL' || a.market === market)
          accountList.push({ ...a, brand: 'PARAPHARMACIE_LAFAYETTE', brandLabel: 'Parapharmacie Lafayette', loginId: a.id });
      }
      if (bKey === 'LASANTE' || bKey === 'ALL') {
        const a = BRANDS.LASANTE.accounts[0];
        if (a && (market === 'ALL' || a.market === market))
          accountList.push({ ...a, brand: 'LASANTE', brandLabel: 'LaSante.net', loginId: a.id });
      }

      const results = await Promise.all(
        accountList.map(acc =>
          queryAccountShopping(api, acc.id, acc.loginId, gaql, refreshToken, acc.brand, acc.brandLabel, acc.market)
        )
      );

      const data = results.flat();
      console.log(`Google Ads API Shopping: ${data.length} rows fetched (brand=${bKey}, market=${market}, ${from} to ${to})`);
      shoppingCache.set(cacheKey, { data, ts: Date.now() });
      return data;
    } finally {
      shoppingInFlight.delete(cacheKey);
    }
  })();

  shoppingInFlight.set(cacheKey, promise);
  return promise;
}

export function clearShoppingCache() { shoppingCache.clear(); }

// ─── Scoring (CC FR only) ────────────────────────────────

const scoringCache = new Map();
const SCORING_CACHE_TTL = 30 * 60 * 1000;

export async function getScoringData(from, to) {
  const cacheKey = `scoring_v3|${from}|${to}`;
  const entry = scoringCache.get(cacheKey);
  if (entry && (Date.now() - entry.ts) < SCORING_CACHE_TTL) return entry.data;
  scoringCache.delete(cacheKey);

  const refreshToken = getRefreshToken();
  const api = getApi();
  const ccFr = BRANDS.COCOONCENTER.accounts.find(a => a.market === 'FR');
  const customer = getCustomer(api, ccFr.id, MCC_ID, refreshToken);
  const marginActionId = getMarginConversionActionId('COCOONCENTER', 'FR');

  // Helper to map campaign name to scoring bucket
  const getBucket = (name) => {
    const n = name.toLowerCase();
    if (n.includes('top') || n.includes('middle')) return 'TOP_MIDDLE';
    if (n.includes('flop')) return 'FLOP';
    if (n.includes('zombie')) return 'ZOMBIE';
    return null; // Ignore others
  };

  // 1. Query for base metrics by campaign
  const baseGAQL = `SELECT
      campaign.id,
      campaign.name,
      metrics.cost_micros,
      metrics.conversions_value,
      metrics.impressions,
      metrics.clicks,
      metrics.conversions
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
    AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'`;

  // 2. Query for real margin by campaign — only if a conversion action is
  // configured for this market. Without it we still return base metrics, the
  // POAS column on the frontend will just be 0.
  const marginGAQL = marginActionId ? `SELECT
      campaign.id,
      segments.conversion_action,
      metrics.all_conversions_value
    FROM campaign
    WHERE segments.date BETWEEN '${from}' AND '${to}'
    AND segments.conversion_action = 'customers/${ccFr.id.replace(/-/g, '')}/conversionActions/${marginActionId}'
    AND campaign.advertising_channel_type = 'PERFORMANCE_MAX'` : null;

  const [baseResults, marginResults] = await Promise.all([
    customer.query(baseGAQL).catch(e => { console.error('Base scoring query error:', e?.message || e); return []; }),
    marginGAQL
      ? customer.query(marginGAQL).catch(e => { console.error('Margin scoring query error:', e?.message || e); return []; })
      : Promise.resolve([]),
  ]);

  const byCampaignId = {};

  // Process base metrics
  for (const r of baseResults) {
    const bucket = getBucket(r.campaign.name);
    if (!bucket) continue; // Skip campaigns that don't match our 3 segments

    const cid = String(r.campaign.id);
    if (!byCampaignId[cid]) {
      byCampaignId[cid] = {
        scoring: bucket,
        cost: 0, revenue: 0, margin: 0, impressions: 0, clicks: 0, conversions: 0
      };
    }
    
    const c = byCampaignId[cid];
    c.cost += Number(r.metrics.cost_micros || 0) / 1e6;
    c.revenue += Number(r.metrics.conversions_value || 0);
    c.impressions += Number(r.metrics.impressions || 0);
    c.clicks += Number(r.metrics.clicks || 0);
    c.conversions += Number(r.metrics.conversions || 0);
  }
// Map margin data onto campaigns
for (const r of marginResults) {
  const cid = String(r.campaign.id);
  if (byCampaignId[cid]) {
    byCampaignId[cid].margin += Number(r.metrics.all_conversions_value || 0);
  }
}

  // Final aggregation by scoring bucket
  const SCORING_META = {
    'TOP_MIDDLE': { label: 'Top/Middle', color: '#00B87A', order: 1 },
    'FLOP':       { label: 'Flop',       color: '#E8524A', order: 2 },
    'ZOMBIE':     { label: 'Zombie',     color: '#8896B0', order: 3 },
  };

  const buckets = {};
  Object.values(byCampaignId).forEach(c => {
    if (!buckets[c.scoring]) {
      const meta = SCORING_META[c.scoring];
      buckets[c.scoring] = { scoring: c.scoring, label: meta.label, color: meta.color, order: meta.order, cost: 0, revenue: 0, margin: 0, impressions: 0, clicks: 0, conversions: 0, count: 0 };
    }
    const b = buckets[c.scoring];
    b.cost += c.cost;
    b.revenue += c.revenue;
    b.margin += c.margin;
    b.impressions += c.impressions;
    b.clicks += c.clicks;
    b.conversions += c.conversions;
    b.count += 1; 
  });

  const data = Object.values(buckets).sort((a, b) => a.order - b.order);
  scoringCache.set(cacheKey, { data, ts: Date.now() });
  return data;
}

export function clearScoringCache() { scoringCache.clear(); }

export async function getComarketRows({ from, to }) {
  const refreshToken = getRefreshToken();
  const api = getApi();

  // Query FR Cocooncenter with comarket included (override GAQL filter)
  const gaql = buildGAQL(from, to, true);
  const frAccount = BRANDS.COCOONCENTER.accounts.find(a => a.market === 'FR');
  const rows = await queryAccount(api, frAccount.id, MCC_ID, gaql, refreshToken, 'COCOONCENTER', 'Cocooncenter', 'FR');

  return rows.filter(r => r.comarket);
}

// ─── Competition data ───────────────────────────────────

const compCache = new Map();
const COMP_CACHE_TTL = 60 * 60 * 1000; // 1h

function getFromCompCache(key) {
  const entry = compCache.get(key);
  if (entry && (Date.now() - entry.ts) < COMP_CACHE_TTL) return entry.data;
  compCache.delete(key);
  return null;
}
function setCompCache(key, data) { compCache.set(key, { data, ts: Date.now() }); }

export function clearCompCache() { compCache.clear(); }

function buildOwnMetricsGAQL(dateFrom, dateTo) {
  return `SELECT
    customer.id,
    campaign.advertising_channel_type,
    campaign.name,
    metrics.search_impression_share,
    metrics.search_click_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share,
    metrics.search_absolute_top_impression_share,
    metrics.search_top_impression_share,
    metrics.impressions,
    metrics.clicks,
    metrics.cost_micros
  FROM campaign
  WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    AND campaign.status != 'REMOVED'`;
}

function buildAuctionInsightGAQL(dateFrom, dateTo) {
  return `SELECT
    auction_insight.domain,
    campaign.advertising_channel_type,
    metrics.auction_insight_search_impression_share,
    metrics.auction_insight_search_overlap_rate,
    metrics.auction_insight_search_position_above_rate,
    metrics.auction_insight_search_top_impression_share,
    metrics.auction_insight_search_outranking_share
  FROM auction_insight
  WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    AND campaign.status != 'REMOVED'
    AND campaign.advertising_channel_type IN ('SEARCH', 'SHOPPING')`;
}

function normalizeOwnMetricsRow(row, market) {
  const channelType = mapChannelType(row.campaign?.advertising_channel_type);
  const isPMax = channelType === 'Performance Max';
  const impressions = Number(row.metrics?.impressions || 0);
  const cost = Number(row.metrics?.cost_micros || 0) / 1e6;
  const safe = (v) => (v != null && v !== '' && !Number.isNaN(Number(v))) ? Number(v) : null;
  return {
    market, channelType, isPMax, impressions, cost,
    impression_share: !isPMax ? safe(row.metrics?.search_impression_share) : null,
    click_share:      !isPMax ? safe(row.metrics?.search_click_share) : null,
    lost_budget:      !isPMax ? safe(row.metrics?.search_budget_lost_impression_share) : null,
    lost_rank:        !isPMax ? safe(row.metrics?.search_rank_lost_impression_share) : null,
    abs_top_share:    !isPMax ? safe(row.metrics?.search_absolute_top_impression_share) : null,
    top_share:        !isPMax ? safe(row.metrics?.search_top_impression_share) : null,
  };
}

function normalizeAuctionRow(row, market) {
  const safe = (v) => (v != null && v !== '' && !Number.isNaN(Number(v))) ? Number(v) : null;
  return {
    market,
    domain: row.auction_insight?.domain || '',
    channelType: mapChannelType(row.campaign?.advertising_channel_type),
    impression_share:  safe(row.metrics?.auction_insight_search_impression_share),
    overlap_rate:      safe(row.metrics?.auction_insight_search_overlap_rate),
    position_above:    safe(row.metrics?.auction_insight_search_position_above_rate),
    top_share:         safe(row.metrics?.auction_insight_search_top_impression_share),
    outranking_share:  safe(row.metrics?.auction_insight_search_outranking_share),
  };
}

async function queryAccountCompetition(api, accountId, loginCustomerId, ownGAQL, auctionGAQL, refreshToken, market) {
  const customer = getCustomer(api, accountId, loginCustomerId, refreshToken);
  const [ownResults, auctionResults] = await Promise.all([
    customer.query(ownGAQL).catch(e => { console.error(`Competition own ${market}:`, e.message); return []; }),
    customer.query(auctionGAQL).catch(e => { console.error(`Auction ${market}:`, e.message); return []; }),
  ]);
  return {
    own: ownResults.map(r => normalizeOwnMetricsRow(r, market)),
    insights: auctionResults.map(r => normalizeAuctionRow(r, market)).filter(r => r.domain),
  };
}

export async function getCompetitionData(brand, dateFrom, dateTo) {
  const cacheKey = `comp|${brand}|${dateFrom}|${dateTo}`;
  const cached = getFromCompCache(cacheKey);
  if (cached) return cached;

  const refreshToken = getRefreshToken();
  const api = getApi();
  const ownGAQL = buildOwnMetricsGAQL(dateFrom, dateTo);
  const auctionGAQL = buildAuctionInsightGAQL(dateFrom, dateTo);

  let allOwn = [], allInsights = [];

  if (brand === 'COCOONCENTER') {
    const results = await Promise.all(
      BRANDS.COCOONCENTER.accounts.map(acc =>
        queryAccountCompetition(api, acc.id, MCC_ID, ownGAQL, auctionGAQL, refreshToken, acc.market)
      )
    );
    results.forEach(r => { allOwn.push(...r.own); allInsights.push(...r.insights); });
  } else if (brand === 'PASCAL_COSTE') {
    const acc = BRANDS.PASCAL_COSTE.accounts[0];
    const r = await queryAccountCompetition(api, acc.id, acc.id, ownGAQL, auctionGAQL, refreshToken, acc.market);
    allOwn = r.own; allInsights = r.insights;
  } else if (brand === 'PARAPHARMACIE_LAFAYETTE') {
    const acc = BRANDS.PARAPHARMACIE_LAFAYETTE.accounts[0];
    const r = await queryAccountCompetition(api, acc.id, acc.id, ownGAQL, auctionGAQL, refreshToken, acc.market);
    allOwn = r.own; allInsights = r.insights;
  } else if (brand === 'LASANTE') {
    const acc = BRANDS.LASANTE.accounts[0];
    if (acc) {
      const r = await queryAccountCompetition(api, acc.id, acc.id, ownGAQL, auctionGAQL, refreshToken, acc.market);
      allOwn = r.own; allInsights = r.insights;
    }
  }

  const data = { own: allOwn, insights: allInsights };
  setCompCache(cacheKey, data);
  return data;
}

function buildTrendGAQL(dateFrom, dateTo) {
  return `SELECT
    campaign.advertising_channel_type,
    segments.date,
    metrics.search_impression_share,
    metrics.search_budget_lost_impression_share,
    metrics.search_rank_lost_impression_share,
    metrics.search_top_impression_share,
    metrics.impressions,
    metrics.cost_micros
  FROM campaign
  WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'
    AND campaign.status != 'REMOVED'`;
}

export async function getCompetitionTrendData(brand, market, dateFrom, dateTo) {
  const cacheKey = `comptrend|${brand}|${market}|${dateFrom}|${dateTo}`;
  const cached = getFromCompCache(cacheKey);
  if (cached) return cached;

  const refreshToken = getRefreshToken();
  const api = getApi();
  const gaql = buildTrendGAQL(dateFrom, dateTo);
  const safe = (v) => (v != null && v !== '' && !Number.isNaN(Number(v))) ? Number(v) : null;

  const normRow = (row, mkt) => {
    const channelType = mapChannelType(row.campaign?.advertising_channel_type);
    const isPMax = channelType === 'Performance Max';
    return {
      date: row.segments?.date || '',
      market: mkt, isPMax,
      impressions: Number(row.metrics?.impressions || 0),
      cost: Number(row.metrics?.cost_micros || 0) / 1e6,
      impression_share: !isPMax ? safe(row.metrics?.search_impression_share) : null,
      lost_budget:      !isPMax ? safe(row.metrics?.search_budget_lost_impression_share) : null,
      lost_rank:        !isPMax ? safe(row.metrics?.search_rank_lost_impression_share) : null,
      top_share:        !isPMax ? safe(row.metrics?.search_top_impression_share) : null,
    };
  };

  let rows = [];

  if (brand === 'COCOONCENTER') {
    const accounts = market === 'ALL'
      ? BRANDS.COCOONCENTER.accounts
      : BRANDS.COCOONCENTER.accounts.filter(a => a.market === market);
    const results = await Promise.all(
      accounts.map(acc => {
        const customer = getCustomer(api, acc.id, MCC_ID, refreshToken);
        return customer.query(gaql)
          .then(r => r.map(row => normRow(row, acc.market)))
          .catch(e => { console.error(`Trend ${acc.market}:`, e.message); return []; });
      })
    );
    rows = results.flat();
  } else {
    const brandDef = brand === 'PASCAL_COSTE' ? BRANDS.PASCAL_COSTE
      : brand === 'LASANTE' ? BRANDS.LASANTE
      : BRANDS.PARAPHARMACIE_LAFAYETTE;
    const acc = brandDef.accounts[0];
    if (acc && (market === 'ALL' || acc.market === market)) {
      const customer = getCustomer(api, acc.id, acc.id, refreshToken);
      rows = await customer.query(gaql)
        .then(r => r.map(row => normRow(row, acc.market)))
        .catch(() => []);
    }
  }

  setCompCache(cacheKey, rows);
  return rows;
}
