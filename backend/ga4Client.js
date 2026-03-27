import { getOAuth2Client, getValidAccessToken } from './auth.js';
import { GA4_PROPERTIES, BRAND_KEY_TO_PROPERTY } from './config/ga4Properties.js';
import { GA4_STREAMS, setGA4Streams } from './config/ga4Streams.js';

// ─── Cache ─────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

export function clearGA4Cache() {
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

// ─── Fetch streams via Admin API ───────────────────────

export async function fetchAndWriteStreams() {
  if (Object.keys(GA4_STREAMS).length > 0) return GA4_STREAMS;

  const accessToken = await getValidAccessToken();
  const streams = {};

  for (const [brandName, propertyId] of Object.entries(GA4_PROPERTIES)) {
    streams[brandName] = {};
    try {
      const url = `https://analyticsadmin.googleapis.com/v1beta/properties/${propertyId}/dataStreams`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        console.error(`GA4 Admin API error for ${brandName}: ${res.status} ${await res.text()}`);
        continue;
      }
      const data = await res.json();
      const dataStreams = data.dataStreams || [];
      for (const ds of dataStreams) {
        if (ds.type !== 'WEB_DATA_STREAM') continue;
        const streamId = ds.name.split('/').pop();
        const displayName = ds.displayName || '';
        const market = extractMarketFromStreamName(displayName, brandName);
        if (market) {
          streams[brandName][market] = streamId;
        }
      }
      console.log(`GA4 streams for ${brandName}:`, streams[brandName]);
    } catch (err) {
      console.error(`Error fetching GA4 streams for ${brandName}:`, err.message);
    }
  }

  setGA4Streams(streams);
  return streams;
}

function extractMarketFromStreamName(displayName, brandName) {
  const name = displayName.toLowerCase();
  const marketPatterns = {
    'FR': ['.fr', ' fr', 'france'],
    'BE': ['.be', ' be', 'belgique', 'belgium'],
    'NL': ['.nl', ' nl', 'pays-bas', 'netherlands'],
    'DE': ['.de', ' de', 'allemagne', 'germany'],
    'IT': ['.it', ' it', 'italie', 'italy'],
    'ES': ['.es', ' es', 'espagne', 'spain'],
    'UK': ['.co.uk', ' uk', 'royaume-uni', 'united kingdom'],
    'AT': ['.at', ' at', 'autriche', 'austria'],
    'PT': ['.pt', ' pt', 'portugal'],
    'LU': ['.lu', ' lu', 'luxembourg'],
    'SE': ['.se', ' se', 'suède', 'sweden'],
    'NO': ['.no', ' no', 'norvège', 'norway'],
    'FI': ['.fi', ' fi', 'finlande', 'finland'],
    'PL': ['.pl', ' pl', 'pologne', 'poland'],
    'IE': ['.ie', ' ie', 'irlande', 'ireland'],
    'RO': ['.ro', ' ro', 'roumanie', 'romania'],
    'SA': ['.sa', ' sa', 'arabie'],
    'CA': ['.ca', ' ca', 'canada'],
    'AU': ['.com.au', ' au', 'australie', 'australia'],
    'US': ['.com/us', ' us', 'états-unis', 'united states'],
  };

  for (const [market, patterns] of Object.entries(marketPatterns)) {
    if (patterns.some(p => name.includes(p))) return market;
  }

  if (brandName === 'Pascal Coste Shopping' || brandName === 'Parapharmacie Lafayette') {
    return 'FR';
  }

  console.log(`  Unknown stream: "${displayName}" for ${brandName}`);
  return null;
}

// ─── GA4 Data API (REST) ───────────────────────────────

async function runGA4Report({ propertyId, dateFrom, dateTo, dimensions = ['date'], metrics, dimensionFilter }) {
  const accessToken = await getValidAccessToken();

  const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
  const body = {
    dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
    dimensions: dimensions.map(d => ({ name: d })),
    metrics: metrics.map(m => ({ name: m })),
  };

  if (dimensionFilter) {
    body.dimensionFilter = dimensionFilter;
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GA4 Data API ${res.status}: ${errText.slice(0, 200)}`);
  }

  const response = await res.json();
  return parseGA4Response(response, dimensions, metrics);
}

function parseGA4Response(response, dimensions, metrics) {
  if (!response?.rows) return [];

  return response.rows.map(row => {
    const entry = {};
    dimensions.forEach((dim, i) => {
      let val = row.dimensionValues[i]?.value || '';
      if (dim === 'date' && val.length === 8) {
        val = `${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`;
      }
      entry[dim] = val;
    });
    metrics.forEach((met, i) => {
      entry[met] = parseFloat(row.metricValues[i]?.value || '0');
    });
    return entry;
  });
}

// ─── Public API ────────────────────────────────────────

function resolvePropertyIds(brand) {
  if (brand === 'ALL') return Object.entries(BRAND_KEY_TO_PROPERTY);
  const propId = BRAND_KEY_TO_PROPERTY[brand];
  if (!propId) return [];
  return [[brand, propId]];
}

function buildStreamFilter(brand, market) {
  if (!market || market === 'ALL') return null;

  const brandName = brand === 'COCOONCENTER' ? 'Cocooncenter'
    : brand === 'PASCAL_COSTE' ? 'Pascal Coste Shopping'
    : brand === 'PARAPHARMACIE_LAFAYETTE' ? 'Parapharmacie Lafayette'
    : brand;

  const streams = GA4_STREAMS[brandName];
  if (!streams) return null;

  const streamId = streams[market];
  if (!streamId) return null;

  return {
    filter: {
      fieldName: 'streamId',
      stringFilter: { value: streamId, matchType: 'EXACT' },
    },
  };
}

export async function getGA4Kpis({ brand = 'ALL', market = 'ALL', from, to }) {
  const cacheKey = `ga4_kpis_${brand}_${market}_${from}_${to}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const metrics = ['sessions', 'totalUsers', 'transactions', 'totalRevenue'];

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const filter = buildStreamFilter(bKey, market);
    const rows = await runGA4Report({
      propertyId: propId,
      dateFrom: from,
      dateTo: to,
      dimensions: ['date'],
      metrics,
      dimensionFilter: filter,
    }).catch(err => {
      console.error(`GA4 KPI query error (${bKey}):`, err.message);
      return [];
    });
    allRows.push(...rows);
  }

  const agg = aggregateGA4Rows(allRows);
  setCache(cacheKey, agg);
  console.log(`GA4 KPIs: ${allRows.length} rows (brand=${brand}, ${from} to ${to}) → ${agg.sessions} sessions`);
  return agg;
}

export async function getGA4Trend({ brand = 'ALL', market = 'ALL', from, to, granularity = 'day' }) {
  const cacheKey = `ga4_trend_${brand}_${market}_${from}_${to}_${granularity}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const metrics = ['sessions', 'totalRevenue', 'transactions'];

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const filter = buildStreamFilter(bKey, market);
    const rows = await runGA4Report({
      propertyId: propId,
      dateFrom: from,
      dateTo: to,
      dimensions: ['date'],
      metrics,
      dimensionFilter: filter,
    }).catch(err => {
      console.error(`GA4 trend query error (${bKey}):`, err.message);
      return [];
    });
    allRows.push(...rows);
  }

  const grouped = {};
  for (const row of allRows) {
    const key = granularityKey(row.date, granularity);
    if (!grouped[key]) grouped[key] = { sessions: 0, totalRevenue: 0, transactions: 0 };
    grouped[key].sessions += row.sessions;
    grouped[key].totalRevenue += row.totalRevenue;
    grouped[key].transactions += row.transactions;
  }

  const series = Object.entries(grouped)
    .map(([date, d]) => ({
      date,
      sessions: d.sessions,
      revenue: r2(d.totalRevenue),
      transactions: d.transactions,
      cvr: d.sessions > 0 ? r2((d.transactions / d.sessions) * 100) : 0,
      aov: d.transactions > 0 ? r2(d.totalRevenue / d.transactions) : 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  setCache(cacheKey, series);
  return series;
}

export async function getGA4Channels({ brand = 'ALL', market = 'ALL', from, to }) {
  const cacheKey = `ga4_channels_${brand}_${market}_${from}_${to}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const metrics = ['sessions', 'totalRevenue', 'transactions'];

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const filter = buildStreamFilter(bKey, market);
    const rows = await runGA4Report({
      propertyId: propId,
      dateFrom: from,
      dateTo: to,
      dimensions: ['sessionDefaultChannelGroup'],
      metrics,
      dimensionFilter: filter,
    }).catch(err => {
      console.error(`GA4 channels query error (${bKey}):`, err.message);
      return [];
    });
    allRows.push(...rows);
  }

  const byChannel = {};
  for (const row of allRows) {
    const ch = row.sessionDefaultChannelGroup || 'Other';
    if (!byChannel[ch]) byChannel[ch] = { sessions: 0, revenue: 0, transactions: 0 };
    byChannel[ch].sessions += row.sessions;
    byChannel[ch].revenue += row.totalRevenue;
    byChannel[ch].transactions += row.transactions;
  }

  const result = Object.entries(byChannel)
    .map(([channel, d]) => ({
      channel,
      sessions: d.sessions,
      revenue: r2(d.revenue),
      transactions: d.transactions,
      cvr: d.sessions > 0 ? r2((d.transactions / d.sessions) * 100) : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  setCache(cacheKey, result);
  return result;
}

// ─── Helpers ───────────────────────────────────────────

function aggregateGA4Rows(rows) {
  let sessions = 0, users = 0, transactions = 0, revenue = 0;
  for (const r of rows) {
    sessions += r.sessions || 0;
    users += r.totalUsers || 0;
    transactions += r.transactions || 0;
    revenue += r.totalRevenue || 0;
  }
  return {
    sessions,
    users,
    transactions,
    revenue: r2(revenue),
    cvr: sessions > 0 ? r2((transactions / sessions) * 100) : 0,
    aov: transactions > 0 ? r2(revenue / transactions) : 0,
  };
}

function granularityKey(dateStr, gran) {
  if (gran === 'month') return dateStr.slice(0, 7);
  if (gran === 'week') {
    const d = new Date(dateStr);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d);
    monday.setDate(diff);
    return monday.toISOString().slice(0, 10);
  }
  return dateStr;
}

function r2(v) { return Math.round(v * 100) / 100; }
