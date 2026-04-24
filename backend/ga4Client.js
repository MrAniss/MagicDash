import { getOAuth2Client, getValidAccessToken } from './auth.js';
import { GA4_PROPERTIES, BRAND_KEY_TO_PROPERTY } from './config/ga4Properties.js';
import { GA4_STREAMS, setGA4Streams } from './config/ga4Streams.js';
import { getFunnelEvents } from './config/ga4FunnelEvents.js';

// ─── Cache ─────────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000;

export function clearGA4Cache() {
  cache.clear();
}

export function getGA4Streams() {
  return GA4_STREAMS;
}

export async function getGA4Hostnames({ brand = 'COCOONCENTER', from, to }) {
  const properties = resolvePropertyIds(brand);
  const result = {};
  for (const [bKey, propId] of properties) {
    const rows = await runGA4Report({
      propertyId: propId,
      dateFrom: from,
      dateTo: to,
      dimensions: ['hostName'],
      metrics: ['sessions'],
    }).catch(err => { console.error(err.message); return []; });
    result[bKey] = rows
      .sort((a, b) => b.sessions - a.sessions)
      .map(r => ({ hostname: r.hostName, sessions: r.sessions }));
  }
  return result;
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

// Hostnames réels vérifiés via /api/ga4/hostnames
const MARKET_HOSTNAMES = {
  COCOONCENTER: {
    FR: 'www.cocooncenter.com',      // site principal FR = .com
    UK: 'www.cocooncenter.co.uk',
    DE: 'www.cocooncenter.de',
    ES: 'www.cocooncenter.es',
    IT: 'www.cocooncenter.it',
    BE: 'www.cocooncenter.be',
    PL: 'www.cocooncenter.pl',
    PT: 'www.cocooncenter.pt',
    AT: 'www.cocooncenter.at',
    LU: 'www.cocooncenter.lu',
    FI: 'www.cocooncenter.fi',
    NL: 'www.cocooncenter.nl',
    RO: 'www.cocooncenter.ro',
    SE: 'www.cocooncenter.se',
  },
  PASCAL_COSTE:            { FR: 'www.pascal-coste.com' },
  PARAPHARMACIE_LAFAYETTE: { FR: 'www.parapharmacielafayette.com' },
};

// Marchés sans domaine propre → filtrage hostname partagé + pays
// Ces marchés utilisent www.cocooncenter.co.uk mais ont leur propre pays dans GA4
const MARKET_SHARED = {
  COCOONCENTER: {
    NO: { hostname: 'www.cocooncenter.co.uk', country: 'Norway'       },
    IE: { hostname: 'www.cocooncenter.co.uk', country: 'Ireland'      },
    SA: { hostname: 'www.cocooncenter.co.uk', country: 'Saudi Arabia' },
    CA: { hostname: 'www.cocooncenter.co.uk', country: 'Canada'       },
    AU: { hostname: 'www.cocooncenter.co.uk', country: 'Australia'    },
    US: { hostname: 'www.cocooncenter.co.uk', country: 'United States'},
  },
};

// Garde pour compatibilité resolveFilterTag
const MARKET_COUNTRIES = {
  COCOONCENTER: Object.fromEntries(
    Object.entries(MARKET_SHARED.COCOONCENTER).map(([k, v]) => [k, v.country])
  ),
};

// Retourne un tag court décrivant le type de filtre utilisé pour ce marché
// → inclus dans le cache key pour invalider automatiquement si la logique change
function resolveFilterTag(brand, market) {
  if (!market || market === 'ALL') return 'all';
  const brandName = brand === 'COCOONCENTER' ? 'Cocooncenter'
    : brand === 'PASCAL_COSTE' ? 'Pascal Coste Shopping'
    : brand === 'PARAPHARMACIE_LAFAYETTE' ? 'Parapharmacie Lafayette'
    : brand;
  const streams   = GA4_STREAMS[brandName];
  if (streams?.[market])                    return `stream:${streams[market]}`;
  if (MARKET_HOSTNAMES[brand]?.[market])    return `host:${MARKET_HOSTNAMES[brand][market]}`;
  if (MARKET_COUNTRIES[brand]?.[market])    return `country:${MARKET_COUNTRIES[brand][market]}`;
  return 'nofilter';
}

function buildStreamFilter(brand, market) {
  if (!market || market === 'ALL') return null;

  const brandName = brand === 'COCOONCENTER' ? 'Cocooncenter'
    : brand === 'PASCAL_COSTE' ? 'Pascal Coste Shopping'
    : brand === 'PARAPHARMACIE_LAFAYETTE' ? 'Parapharmacie Lafayette'
    : brand;

  // Essai 1 : filtre par streamId (Admin API)
  const streams = GA4_STREAMS[brandName];
  if (streams) {
    const streamId = streams[market];
    if (streamId) {
      return {
        filter: {
          fieldName: 'streamId',
          stringFilter: { value: streamId, matchType: 'EXACT' },
        },
      };
    }
  }

  // Essai 2 : fallback hostname
  const hostnames = MARKET_HOSTNAMES[brand];
  if (hostnames?.[market]) {
    const hostname = hostnames[market];
    console.log(`GA4: no streamId for ${brand}/${market}, fallback hostname (${hostname})`);
    return {
      filter: {
        fieldName: 'hostName',
        stringFilter: { value: hostname, matchType: 'EXACT' },
      },
    };
  }

  // Essai 3 : hostname partagé + pays (marchés sans domaine propre)
  const shared = MARKET_SHARED[brand]?.[market];
  if (shared) {
    console.log(`GA4: shared domain for ${brand}/${market} → hostname(${shared.hostname}) + country(${shared.country})`);
    return {
      andGroup: {
        expressions: [
          { filter: { fieldName: 'hostName', stringFilter: { value: shared.hostname, matchType: 'EXACT' } } },
          { filter: { fieldName: 'country',  stringFilter: { value: shared.country,  matchType: 'EXACT' } } },
        ],
      },
    };
  }

  console.warn(`GA4: no filter found for ${brand}/${market} — no filter applied`);
  return null;
}

function buildSourceMediumFilter(sourceMedium) {
  if (!sourceMedium) return null;
  return {
    filter: {
      fieldName: 'sessionSourceMedium',
      stringFilter: { value: sourceMedium, matchType: 'EXACT' },
    },
  };
}

// Combine deux filtres GA4 avec un AND (aplatit les andGroup imbriqués)
function combineFilters(f1, f2) {
  if (!f1 && !f2) return null;
  if (!f1) return f2;
  if (!f2) return f1;
  const exprs = [
    ...(f1.andGroup ? f1.andGroup.expressions : [f1]),
    ...(f2.andGroup ? f2.andGroup.expressions : [f2]),
  ];
  return { andGroup: { expressions: exprs } };
}

export async function getGA4Rows({ brand = 'ALL', market = 'ALL', from, to, sourceMedium }) {
  const filterTag = resolveFilterTag(brand, market);
  const cacheKey  = `ga4_rows_${brand}_${market}_${filterTag}_${from}_${to}_${sourceMedium || ''}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const metrics = ['sessions', 'totalRevenue', 'transactions', 'totalUsers'];

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const filter = combineFilters(
      buildStreamFilter(bKey, market),
      buildSourceMediumFilter(sourceMedium)
    );
    const rows = await runGA4Report({
      propertyId: propId,
      dateFrom: from,
      dateTo: to,
      dimensions: ['date'],
      metrics,
      dimensionFilter: filter,
    }).catch(err => {
      console.error(`GA4 rows query error (${bKey}):`, err.message);
      return [];
    });
    allRows.push(...rows);
  }

  // Aggregate by date (in case of multiple properties)
  const grouped = {};
  for (const row of allRows) {
    if (!grouped[row.date]) {
      grouped[row.date] = { date: row.date, sessions: 0, revenue: 0, transactions: 0, users: 0 };
    }
    grouped[row.date].sessions += row.sessions;
    grouped[row.date].revenue += row.totalRevenue;
    grouped[row.date].transactions += row.transactions;
    grouped[row.date].users += row.totalUsers;
  }

  const result = Object.values(grouped).sort((a, b) => a.date.localeCompare(b.date));
  setCache(cacheKey, result);
  return result;
}

export async function getGA4Kpis({ brand = 'ALL', market = 'ALL', from, to, sourceMedium }) {
  const filterTag  = resolveFilterTag(brand, market);
  const cacheKey   = `ga4_kpis_${brand}_${market}_${filterTag}_${from}_${to}_${sourceMedium || ''}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const metrics = ['sessions', 'totalUsers', 'firstTimePurchasers', 'transactions', 'totalRevenue'];

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const filter = combineFilters(
      buildStreamFilter(bKey, market),
      buildSourceMediumFilter(sourceMedium)
    );
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

export async function getGA4Trend({ brand = 'ALL', market = 'ALL', from, to, granularity = 'day', sourceMedium }) {
  const filterTag = resolveFilterTag(brand, market);
  const cacheKey  = `ga4_trend_${brand}_${market}_${filterTag}_${from}_${to}_${granularity}_${sourceMedium || ''}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const metrics = ['sessions', 'totalRevenue', 'transactions'];

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const filter = combineFilters(
      buildStreamFilter(bKey, market),
      buildSourceMediumFilter(sourceMedium)
    );
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

export async function getGA4Channels({ brand = 'ALL', market = 'ALL', from, to, compFrom, compTo, sourceMedium }) {
  const filterTag = resolveFilterTag(brand, market);
  const cacheKey  = `ga4_channels_${brand}_${market}_${filterTag}_${from}_${to}_${compFrom || ''}_${sourceMedium || ''}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const metrics = ['sessions', 'totalUsers', 'firstTimePurchasers', 'totalRevenue', 'transactions'];

  async function fetchChannelRows(dateFrom, dateTo) {
    let rows = [];
    for (const [bKey, propId] of properties) {
      const filter = combineFilters(
        buildStreamFilter(bKey, market),
        buildSourceMediumFilter(sourceMedium)
      );
      const r = await runGA4Report({
        propertyId: propId,
        dateFrom,
        dateTo,
        dimensions: ['sessionDefaultChannelGroup'],
        metrics,
        dimensionFilter: filter,
      }).catch(err => { console.error(`GA4 channels query error (${bKey}):`, err.message); return []; });
      rows.push(...r);
    }
    return rows;
  }

  function aggregateByChannel(rows) {
    const map = {};
    for (const row of rows) {
      const ch = row.sessionDefaultChannelGroup || 'Other';
      if (!map[ch]) map[ch] = { sessions: 0, users: 0, newCustomers: 0, revenue: 0, transactions: 0 };
      map[ch].sessions     += row.sessions;
      map[ch].users        += row.totalUsers;
      map[ch].newCustomers += row.firstTimePurchasers;
      map[ch].revenue      += row.totalRevenue;
      map[ch].transactions += row.transactions;
    }
    return map;
  }

  function pct(cur, prev) {
    if (!prev) return cur > 0 ? 100 : 0;
    return r2(((cur - prev) / prev) * 100);
  }

  const [curRows, prevRows] = await Promise.all([
    fetchChannelRows(from, to),
    compFrom && compTo ? fetchChannelRows(compFrom, compTo) : Promise.resolve([]),
  ]);

  const cur = aggregateByChannel(curRows);
  const prev = aggregateByChannel(prevRows);
  const totalSessions = Object.values(cur).reduce((s, d) => s + d.sessions, 0);
  const empty = { sessions: 0, users: 0, newCustomers: 0, revenue: 0, transactions: 0 };

  const result = Object.entries(cur)
    .map(([channel, d]) => {
      const p            = prev[channel] || empty;
      const cvr          = d.sessions > 0 ? r2((d.transactions / d.sessions) * 100) : 0;
      const prevCvr      = p.sessions > 0 ? r2((p.transactions / p.sessions) * 100) : 0;
      const aov          = d.transactions > 0 ? r2(d.revenue / d.transactions) : 0;
      const prevAov      = p.transactions > 0 ? r2(p.revenue / p.transactions) : 0;
      const ncRate       = d.transactions > 0 ? r2((d.newCustomers / d.transactions) * 100) : 0;
      const prevNcRate   = p.transactions > 0 ? r2((p.newCustomers / p.transactions) * 100) : 0;
      return {
        channel,
        sessions:           d.sessions,
        users:              d.users,
        newCustomers:       d.newCustomers,
        revenue:            r2(d.revenue),
        transactions:       d.transactions,
        cvr,
        aov,
        ncRate,
        sessionsPct:        totalSessions > 0 ? r2((d.sessions / totalSessions) * 100) : 0,
        delta_sessions:     pct(d.sessions,     p.sessions),
        delta_users:        pct(d.users,        p.users),
        delta_newCustomers: pct(d.newCustomers, p.newCustomers),
        delta_revenue:      pct(d.revenue,      p.revenue),
        delta_transactions: pct(d.transactions, p.transactions),
        delta_cvr:          pct(cvr,            prevCvr),
        delta_aov:          pct(aov,            prevAov),
        delta_ncRate:       pct(ncRate,         prevNcRate),
      };
    })
    .sort((a, b) => b.sessions - a.sessions);

  setCache(cacheKey, result);
  return result;
}

// ─── GET /api/ga4/bounce-rate-ytd ─────────────────────

export async function getGA4BounceRateYtd({ brand = 'ALL', market = 'ALL', source = 'all', granularity = 'week' }) {
  const year = new Date().getFullYear();
  const from = `${year}-01-01`;
  const to   = new Date().toISOString().slice(0, 10);

  const filterTag = resolveFilterTag(brand, market);
  const cacheKey  = `ga4_bounce_ytd_${brand}_${market}_${filterTag}_${source}_${granularity}_${year}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const seaFilter  = source === 'seo' ? buildSourceMediumFilter('google / cpc') : null;

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const filter = combineFilters(buildStreamFilter(bKey, market), seaFilter);
    const rows = await runGA4Report({
      propertyId: propId,
      dateFrom: from,
      dateTo: to,
      dimensions: ['date'],
      metrics: ['bounceRate', 'sessions'],
      dimensionFilter: filter,
    }).catch(err => {
      console.error(`GA4 bounce rate query error (${bKey}):`, err.message);
      return [];
    });
    allRows.push(...rows);
  }

  // Aggregate daily rows across properties (weighted bounce rate)
  const byDay = {};
  for (const row of allRows) {
    if (!byDay[row.date]) byDay[row.date] = { bounced: 0, sessions: 0 };
    byDay[row.date].bounced  += row.bounceRate * row.sessions;
    byDay[row.date].sessions += row.sessions;
  }

  // Build series based on granularity
  let series;
  if (granularity === 'day') {
    series = Object.entries(byDay)
      .map(([date, d]) => ({
        date,
        bounce_rate: d.sessions > 0 ? r2(d.bounced / d.sessions) : 0,
        sessions: Math.round(d.sessions),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } else {
    // Default: week
    const byWeek = {};
    for (const [date, d] of Object.entries(byDay)) {
      const wk = granularityKey(date, 'week');
      if (!byWeek[wk]) byWeek[wk] = { bounced: 0, sessions: 0 };
      byWeek[wk].bounced  += d.bounced;
      byWeek[wk].sessions += d.sessions;
    }
    series = Object.entries(byWeek)
      .map(([date, d]) => ({
        date,
        bounce_rate: d.sessions > 0 ? r2(d.bounced / d.sessions) : 0,
        sessions: Math.round(d.sessions),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Weighted avg over entire period
  const totW = series.reduce((s, d) => s + d.bounce_rate * d.sessions, 0);
  const totS = series.reduce((s, d) => s + d.sessions, 0);
  const avg  = totS > 0 ? r2(totW / totS) : 0;

  // Trend: last 14 days vs previous 14 days using daily data
  const today = new Date();
  const d14   = new Date(today); d14.setDate(today.getDate() - 14);
  const d28   = new Date(today); d28.setDate(today.getDate() - 28);
  const fmt   = d => d.toISOString().slice(0, 10);

  function weightedAvg(arr) {
    const s = arr.reduce((a, d) => a + d.sessions, 0);
    if (s === 0) return 0;
    return arr.reduce((a, d) => a + d.bounce_rate * d.sessions, 0) / s;
  }

  const dayEntries = Object.entries(byDay).map(([date, d]) => ({
    date,
    bounce_rate: d.sessions > 0 ? d.bounced / d.sessions : 0,
    sessions: d.sessions,
  }));
  const last14  = dayEntries.filter(d => d.date >= fmt(d14));
  const prev14  = dayEntries.filter(d => d.date >= fmt(d28) && d.date < fmt(d14));
  const avgL14  = weightedAvg(last14);
  const avgP14  = weightedAvg(prev14);
  const trend     = avgL14 > avgP14 ? 'UP' : 'DOWN';
  const delta_pct = avgP14 > 0 ? r2(((avgL14 - avgP14) / avgP14) * 100) : 0;

  const result = { data: series, avg, trend, delta_pct };
  setCache(cacheKey, result);
  return result;
}

// ─── GET /api/ga4/cvr-aov-ytd ──────────────────────────

export async function getGA4CvrAovYtd({ brand = 'ALL', market = 'ALL', source = 'all', granularity = 'week' }) {
  const year = new Date().getFullYear();
  const from = `${year}-01-01`;
  const to   = new Date().toISOString().slice(0, 10);

  const filterTag = resolveFilterTag(brand, market);
  const cacheKey  = `ga4_cvr_aov_ytd_${brand}_${market}_${filterTag}_${source}_${granularity}_${year}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties = resolvePropertyIds(brand);
  const seaFilter  = source === 'seo' ? buildSourceMediumFilter('google / cpc') : null;

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const filter = combineFilters(buildStreamFilter(bKey, market), seaFilter);
    const rows = await runGA4Report({
      propertyId: propId,
      dateFrom: from,
      dateTo: to,
      dimensions: ['date'],
      metrics: ['sessions', 'transactions', 'totalRevenue'],
      dimensionFilter: filter,
    }).catch(err => {
      console.error(`GA4 CVR/AOV query error (${bKey}):`, err.message);
      return [];
    });
    allRows.push(...rows);
  }

  // Aggregate daily
  const byDay = {};
  for (const row of allRows) {
    if (!byDay[row.date]) byDay[row.date] = { sessions: 0, transactions: 0, revenue: 0 };
    byDay[row.date].sessions    += row.sessions;
    byDay[row.date].transactions += row.transactions;
    byDay[row.date].revenue      += row.totalRevenue;
  }

  // Build series based on granularity
  let series;
  if (granularity === 'day') {
    series = Object.entries(byDay)
      .map(([date, d]) => ({
        date,
        cvr: d.sessions > 0 ? r2((d.transactions / d.sessions) * 100) : 0,
        aov: d.transactions > 0 ? r2(d.revenue / d.transactions) : 0,
        sessions: Math.round(d.sessions),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  } else {
    // Week
    const byWeek = {};
    for (const [date, d] of Object.entries(byDay)) {
      const wk = granularityKey(date, 'week');
      if (!byWeek[wk]) byWeek[wk] = { sessions: 0, transactions: 0, revenue: 0 };
      byWeek[wk].sessions    += d.sessions;
      byWeek[wk].transactions += d.transactions;
      byWeek[wk].revenue      += d.revenue;
    }
    series = Object.entries(byWeek)
      .map(([date, d]) => ({
        date,
        cvr: d.sessions > 0 ? r2((d.transactions / d.sessions) * 100) : 0,
        aov: d.transactions > 0 ? r2(d.revenue / d.transactions) : 0,
        sessions: Math.round(d.sessions),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  // Weighted averages
  function weightedAvg(arr, field) {
    const s = arr.reduce((a, d) => a + d.sessions, 0);
    if (s === 0) return 0;
    if (field === 'cvr') {
      const txns = arr.reduce((a, d) => a + d.transactions, 0);
      return r2((txns / s) * 100);
    } // aov
    const rev = arr.reduce((a, d) => a + d.revenue, 0);
    return r2(rev / arr.reduce((a, d) => a + d.transactions, 0));
  }

  const dayEntries = Object.entries(byDay).map(([date, d]) => ({
    date,
    sessions: d.sessions,
    transactions: d.transactions,
    revenue: d.revenue,
  }));

  const cvrAvg = weightedAvg(dayEntries, 'cvr');
  const aovAvg = weightedAvg(dayEntries, 'aov');

  // Trend for both metrics
  const today = new Date();
  const d14   = new Date(today); d14.setDate(today.getDate() - 14);
  const d28   = new Date(today); d28.setDate(today.getDate() - 28);
  const fmt   = d => d.toISOString().slice(0, 10);
  const last14 = dayEntries.filter(d => d.date >= fmt(d14));
  const prev14 = dayEntries.filter(d => d.date >= fmt(d28) && d.date < fmt(d14));

  const cvrLast = weightedAvg(last14, 'cvr');
  const cvrPrev = weightedAvg(prev14, 'cvr');
  const cvrTrend   = cvrLast > cvrPrev ? 'UP' : 'DOWN';
  const cvrDelta   = cvrPrev > 0 ? r2(((cvrLast - cvrPrev) / cvrPrev) * 100) : 0;

  const aovLast = weightedAvg(last14, 'aov');
  const aovPrev = weightedAvg(prev14, 'aov');
  const aovTrend   = aovLast > aovPrev ? 'UP' : 'DOWN';
  const aovDelta   = aovPrev > 0 ? r2(((aovLast - aovPrev) / aovPrev) * 100) : 0;

  const result = {
    data: series,
    cvr: { avg: cvrAvg, trend: cvrTrend, delta_pct: cvrDelta },
    aov: { avg: aovAvg, trend: aovTrend, delta_pct: aovDelta },
  };
  setCache(cacheKey, result);
  return result;
}

// ─── Funnel YTD ────────────────────────────────────────

const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];

function makeFunnelLabel(dateStr, gran) {
  if (gran === 'day') {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getDate()} ${MONTHS_FR[d.getMonth()]}`;
  }
  const mon = new Date(dateStr + 'T00:00:00');
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.getDate()}-${sun.getDate()} ${MONTHS_FR[mon.getMonth()]}`;
  }
  return `${mon.getDate()} ${MONTHS_FR[mon.getMonth()]} - ${sun.getDate()} ${MONTHS_FR[sun.getMonth()]}`;
}

function makePeriodId(dateStr, gran) {
  if (gran === 'day') return dateStr;
  const d = new Date(dateStr + 'T00:00:00');
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfW1 = new Date(jan4);
  startOfW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  const wn = Math.round((d - startOfW1) / (7 * 24 * 60 * 60 * 1000)) + 1;
  return `${d.getFullYear()}-W${String(wn).padStart(2, '0')}`;
}

export async function getGA4FunnelYtd({ brand = 'ALL', market = 'ALL', granularity = 'week' }) {
  const year = new Date().getFullYear();
  const from = `${year}-01-01`;
  const to   = new Date().toISOString().slice(0, 10);

  const filterTag = resolveFilterTag(brand, market);
  const cacheKey  = `ga4_funnel_ytd_${brand}_${market}_${filterTag}_${granularity}_${year}`;
  const cached = getFromCache(cacheKey);
  if (cached) return cached;

  const properties  = resolvePropertyIds(brand);
  const funnelSteps = getFunnelEvents(brand !== 'ALL' ? brand : null);
  const eventNames  = funnelSteps.map(s => s.eventName);

  let allRows = [];
  for (const [bKey, propId] of properties) {
    const streamFilter = buildStreamFilter(bKey, market);
    const eventFilter  = {
      filter: {
        fieldName: 'eventName',
        inListFilter: { values: eventNames },
      },
    };
    const filter = combineFilters(streamFilter, eventFilter);

    const rows = await runGA4Report({
      propertyId: propId,
      dateFrom: from,
      dateTo: to,
      dimensions: ['date', 'eventName'],
      metrics: ['eventCount'],
      dimensionFilter: filter,
    }).catch(err => {
      console.error(`GA4 funnel query error (${bKey}):`, err.message);
      return [];
    });
    allRows.push(...rows);
  }

  // Aggregate by day + step key
  const byDay = {};
  for (const row of allRows) {
    const step = funnelSteps.find(s => s.eventName === row.eventName);
    if (!step) continue;
    if (!byDay[row.date]) byDay[row.date] = {};
    byDay[row.date][step.key] = (byDay[row.date][step.key] || 0) + row.eventCount;
  }

  // Group by granularity
  const periodMap = {};
  if (granularity === 'day') {
    Object.assign(periodMap, byDay);
  } else {
    for (const [date, events] of Object.entries(byDay)) {
      const wk = granularityKey(date, 'week');
      if (!periodMap[wk]) periodMap[wk] = {};
      for (const [k, v] of Object.entries(events)) {
        periodMap[wk][k] = (periodMap[wk][k] || 0) + v;
      }
    }
  }

  const series = Object.entries(periodMap)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateStr, steps]) => {
      const cart     = steps.add_to_cart       || 0;
      const checkout = steps.begin_checkout     || 0;
      const shipping = steps.add_shipping_info  || 0;
      const payment  = steps.add_payment_info   || 0;
      const purchase = steps.purchase           || 0;
      return {
        period: makePeriodId(dateStr, granularity),
        label:  makeFunnelLabel(dateStr, granularity),
        steps:  { add_to_cart: cart, begin_checkout: checkout, add_shipping_info: shipping, add_payment_info: payment, purchase },
        completion_rates: {
          cart_to_checkout:     cart     > 0 ? r2((checkout / cart)     * 100) : 0,
          checkout_to_shipping: checkout > 0 ? r2((shipping / checkout) * 100) : 0,
          shipping_to_payment:  shipping > 0 ? r2((payment  / shipping) * 100) : 0,
          payment_to_purchase:  payment  > 0 ? r2((purchase / payment)  * 100) : 0,
          cart_to_purchase:     cart     > 0 ? r2((purchase / cart)     * 100) : 0,
        },
      };
    });

  setCache(cacheKey, series);
  return series;
}

// ─── Helpers ───────────────────────────────────────────

function aggregateGA4Rows(rows) {
  let sessions = 0, users = 0, newCustomers = 0, transactions = 0, revenue = 0;
  for (const r of rows) {
    sessions += r.sessions || 0;
    users += r.totalUsers || 0;
    newCustomers += r.firstTimePurchasers || 0;
    transactions += r.transactions || 0;
    revenue += r.totalRevenue || 0;
  }
  return {
    sessions,
    users,
    newCustomers,
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
