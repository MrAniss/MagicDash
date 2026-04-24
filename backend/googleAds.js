import { getValidAccessToken } from './auth.js';
import { MCC_ID } from './config/accounts.js';

const API_VERSION = 'v17';
const BASE_URL = `https://googleads.googleapis.com/${API_VERSION}/customers`;

function stripDashes(id) {
  return id.replace(/-/g, '');
}

async function executeGaql(loginCustomerId, customerId, gaql) {
  const accessToken = await getValidAccessToken();
  const cid = stripDashes(customerId);

  const res = await fetch(`${BASE_URL}/${cid}/googleAds:search`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'developer-token': process.env.GOOGLE_DEVELOPER_TOKEN,
      'login-customer-id': stripDashes(loginCustomerId),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: gaql }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Google Ads API error (${res.status}): ${err}`);
  }

  const data = await res.json();
  return data.results || [];
}

/**
 * Query via MCC — login_customer_id = MCC_ID
 */
export async function queryMCC(customerId, gaql) {
  return executeGaql(MCC_ID, customerId, gaql);
}

/**
 * Query standalone account — login_customer_id = account itself
 */
export async function queryStandalone(customerId, gaql) {
  return executeGaql(customerId, customerId, gaql);
}

/**
 * Smart query — picks the right mode based on account config
 */
export async function queryAccount(account, gaql) {
  if (account.mode === 'standalone') {
    return queryStandalone(account.id, gaql);
  }
  return queryMCC(account.id, gaql);
}

/**
 * Build a GAQL metrics query for a date range
 */
export function buildMetricsQuery(resource, dateFrom, dateTo, extraFields = '', whereClause = '') {
  const fields = [
    'metrics.cost_micros',
    'metrics.conversions_value',
    'metrics.conversions',
    'metrics.clicks',
    'metrics.impressions',
    'metrics.cost_per_conversion',
  ];

  if (extraFields) fields.push(...extraFields.split(',').map(f => f.trim()));

  let query = `SELECT ${fields.join(', ')} FROM ${resource}`;
  query += ` WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`;
  if (whereClause) query += ` AND ${whereClause}`;

  return query;
}

/**
 * Build a daily/segmented metrics query
 */
export function buildTrendQuery(resource, dateFrom, dateTo, granularity = 'day', whereClause = '') {
  const segmentField = granularity === 'day' ? 'segments.date' :
                        granularity === 'week' ? 'segments.week' :
                        'segments.month';

  let query = `SELECT ${segmentField}, metrics.cost_micros, metrics.conversions_value, metrics.conversions, metrics.clicks, metrics.impressions FROM ${resource}`;
  query += ` WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`;
  if (whereClause) query += ` AND ${whereClause}`;
  query += ` ORDER BY ${segmentField}`;

  return query;
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
  
  // If the API returns "0.52" it means 52%. If it returns "52%" it also means 52%.
  // We want to return 0.52 in both cases so that parseMetrics (* 100) gives 52.
  return hasPct ? num / 100 : num;
}

/**
 * Build campaign-level query
 */
export function buildCampaignQuery(dateFrom, dateTo, campaignType = null) {
  const fields = [
    'campaign.name',
    'campaign.advertising_channel_type',
    'campaign.status',
    'metrics.cost_micros',
    'metrics.conversions_value',
    'metrics.conversions',
    'metrics.clicks',
    'metrics.impressions',
    'metrics.search_impression_share',
    'metrics.search_rank_lost_impression_share',
    'metrics.search_budget_lost_impression_share',
    'metrics.absolute_top_impression_percentage',
    'metrics.top_impression_percentage',
    'segments.date'
  ];

  let query = `SELECT ${fields.join(', ')} FROM campaign`;
  query += ` WHERE segments.date BETWEEN '${dateFrom}' AND '${dateTo}'`;
  query += ` AND campaign.status != 'REMOVED'`;

  if (campaignType && campaignType !== 'ALL') {
    const typeMap = {
      'Performance Max': 'PERFORMANCE_MAX',
      'PMax': 'PERFORMANCE_MAX',
      'Shopping': 'SHOPPING',
      'Search': 'SEARCH',
      'DSA': 'SEARCH',
    };
    if (typeMap[campaignType]) {
      query += ` AND campaign.advertising_channel_type = '${typeMap[campaignType]}'`;
    }
  }

  return query;
}

/**
 * Parse metrics from API rows into usable numbers
 */
export function parseMetrics(rows) {
  let spend = 0, revenue = 0, conversions = 0, clicks = 0, impressions = 0;
  let sumImpShare = 0, sumRankLost = 0, sumBudgetLost = 0;
  let sumAbsTop = 0, sumTop = 0;

  for (const row of rows) {
    const m = row.metrics || {};
    const imps = Number(m.impressions || 0);
    
    spend += Number(m.costMicros ?? m.cost_micros ?? 0) / 1_000_000;
    revenue += Number(m.conversionsValue ?? m.conversions_value ?? 0);
    conversions += Number(m.conversions ?? 0);
    clicks += Number(m.clicks ?? 0);
    impressions += imps;

    // REST API JSON field mapping (camelCase)
    const isVal = m.searchImpressionShare;
    const rlVal = m.searchRankLostImpressionShare;
    const blVal = m.searchBudgetLostImpressionShare;
    const absVal = m.absoluteTopImpressionPercentage;
    const topVal = m.topImpressionPercentage;

    if (imps > 0) {
      sumImpShare += parsePct(isVal) * imps;
      sumRankLost += parsePct(rlVal) * imps;
      sumBudgetLost += parsePct(blVal) * imps;
      sumAbsTop += parsePct(absVal) * imps;
      sumTop += parsePct(topVal) * imps;
    }
  }

  const roas = spend > 0 ? revenue / spend : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
  
  const avgIS = impressions > 0 ? (sumImpShare / impressions) * 100 : 0;
  const avgRankLost = impressions > 0 ? (sumRankLost / impressions) * 100 : 0;
  const avgBudgetLost = impressions > 0 ? (sumBudgetLost / impressions) * 100 : 0;
  const avgAbsTop = impressions > 0 ? (sumAbsTop / impressions) * 100 : 0;
  const avgTop = impressions > 0 ? (sumTop / impressions) * 100 : 0;

  // Fallback: If IS is 0 but AbsTop is not, it's likely PMax Search traffic
  let impressionShare = avgIS;
  if (impressionShare === 0 && avgAbsTop > 0) {
    impressionShare = avgAbsTop;
  }

  return { 
    spend, revenue, roas, conversions, cvr, clicks, impressions,
    impressionShare, 
    rankLostShare: avgRankLost, 
    budgetLostShare: avgBudgetLost, 
    absTopShare: avgAbsTop, 
    topShare: avgTop 
  };
}

/**
 * Parse trend rows grouped by date segment
 */
export function parseTrendRows(rows) {
  const byDate = {};
  for (const row of rows) {
    const date = row.segments?.date || row.segments?.week || row.segments?.month || 'unknown';
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(row);
  }

  return Object.entries(byDate).map(([date, dateRows]) => {
    const m = parseMetrics(dateRows);
    return { date, ...m };
  }).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Parse campaign-level rows grouped by campaign
 */
export function parseCampaignRows(rows) {
  const byCampaign = {};
  for (const row of rows) {
    const name = row.campaign?.name || 'Unknown';
    if (!byCampaign[name]) {
      byCampaign[name] = {
        campaign_name: name,
        type: mapChannelType(row.campaign?.advertisingChannelType),
        status: row.campaign?.status || 'UNKNOWN',
        rows: [],
      };
    }
    byCampaign[name].rows.push(row);
  }

  return Object.values(byCampaign).map(c => {
    const m = parseMetrics(c.rows);
    const ctr = m.impressions > 0 ? (m.clicks / m.impressions) * 100 : 0;
    return {
      campaign_name: c.campaign_name,
      type: c.type,
      status: c.status,
      ...m,
      ctr,
    };
  });
}

function mapChannelType(type) {
  const map = {
    'PERFORMANCE_MAX': 'Performance Max',
    '10': 'Performance Max',
    'SEARCH': 'Search',
    '2': 'Search',
    'SHOPPING': 'Shopping',
    '4': 'Shopping',
    'DISPLAY': 'Display',
    '3': 'Display',
    'VIDEO': 'Video',
    '6': 'Video',
    'MULTI_CHANNEL': 'Multi-Channel',
    '7': 'Multi-Channel',
    'DISCOVERY': 'Discovery',
    '12': 'Discovery',
    'DEMAND_GEN': 'Demand Gen',
    '13': 'Demand Gen',
    'SMART': 'Performance Max',
    '9': 'Performance Max',
  };
  const t = String(type).toUpperCase();
  return map[t] || type || 'Other';
}
