import { GoogleAdsApi } from 'google-ads-api';
import { getOAuth2Client, getValidAccessToken } from '../auth.js';
import { BRANDS, MCC_ID } from '../config/accounts.js';
import { BRAND_KEY_TO_PROPERTY, resolvePropertyId } from '../config/ga4Properties.js';
import { GA4_STREAMS } from '../config/ga4Streams.js';

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
  if (!creds?.refresh_token) throw new Error('NOT_AUTHENTICATED');
  return creds.refresh_token;
}

function getCustomer(api, customerId, loginCustomerId, refreshToken) {
  return api.Customer({
    customer_id: customerId.replace(/-/g, ''),
    login_customer_id: loginCustomerId.replace(/-/g, ''),
    refresh_token: refreshToken,
  });
}

// ─── Security check ────────────────────────────────────

function validateGAQL(gaql) {
  const lower = gaql.toLowerCase();
  if (
    lower.includes('mutate') ||
    lower.includes('delete') ||
    lower.includes('update') ||
    lower.includes('insert')
  ) {
    throw new Error('Requête non autorisée — lecture seule uniquement');
  }
}

// ─── Account resolution ────────────────────────────────

function getAccountsForIntent(brandKey, market) {
  const accounts = [];

  if (brandKey === 'ALL' || brandKey === 'COCOONCENTER') {
    const list = BRANDS.COCOONCENTER.accounts;
    const filtered = (market && market !== 'ALL')
      ? list.filter(a => a.market === market)
      : list;
    filtered.forEach(acc =>
      accounts.push({ ...acc, loginCustomerId: MCC_ID, brand: 'COCOONCENTER', brandLabel: 'Cocooncenter' })
    );
  }

  if (brandKey === 'ALL' || brandKey === 'PASCAL_COSTE') {
    const acc = BRANDS.PASCAL_COSTE.accounts[0];
    if (!market || market === 'ALL' || market === 'FR') {
      accounts.push({ ...acc, loginCustomerId: acc.id, brand: 'PASCAL_COSTE', brandLabel: 'Pascal Coste Shopping' });
    }
  }

  if (brandKey === 'ALL' || brandKey === 'PARAPHARMACIE_LAFAYETTE') {
    const acc = BRANDS.PARAPHARMACIE_LAFAYETTE.accounts[0];
    if (!market || market === 'ALL' || market === 'FR') {
      accounts.push({ ...acc, loginCustomerId: acc.id, brand: 'PARAPHARMACIE_LAFAYETTE', brandLabel: 'Parapharmacie Lafayette' });
    }
  }

  return accounts;
}

// ─── Row flattener ─────────────────────────────────────

function flattenRow(row) {
  const flat = {};

  function recurse(obj, prefix = '') {
    for (const [key, val] of Object.entries(obj || {})) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (val !== null && val !== undefined && typeof val === 'object' && !Array.isArray(val)) {
        recurse(val, fullKey);
      } else {
        flat[fullKey] = val;
      }
    }
  }
  recurse(row);

  // Normalize common computed fields
  const costMicros = Number(flat['metrics.cost_micros'] || 0);
  if (costMicros) flat['cost'] = +(costMicros / 1e6).toFixed(2);
  if (flat['metrics.conversions_value'] != null) flat['revenue'] = +Number(flat['metrics.conversions_value']).toFixed(2);
  if (flat['metrics.conversions'] != null) flat['conversions'] = +Number(flat['metrics.conversions']).toFixed(0);
  if (flat['metrics.impressions'] != null) flat['impressions'] = Number(flat['metrics.impressions']);
  if (flat['metrics.clicks'] != null) flat['clicks'] = Number(flat['metrics.clicks']);
  if (flat['cost'] > 0 && flat['revenue'] != null) flat['roas'] = +(flat['revenue'] / flat['cost']).toFixed(2);

  return flat;
}

// ─── Google Ads execution ──────────────────────────────

async function executeGoogleAdsQuery(intent) {
  const { gaql, brand_key, market } = intent;
  validateGAQL(gaql);

  const api = getApi();
  const refreshToken = getRefreshToken();
  const accounts = getAccountsForIntent(brand_key, market);

  if (accounts.length === 0) {
    return { rows: [], accounts_queried: [], query: gaql };
  }

  let firstError = null;
  const results = await Promise.all(
    accounts.map(async (acc) => {
      try {
        const customer = getCustomer(api, acc.id, acc.loginCustomerId, refreshToken);
        const rows = await customer.query(gaql);
        return rows.map(row => ({
          ...flattenRow(row),
          _brand: acc.brandLabel,
          _market: acc.market,
          _account_id: acc.id,
        }));
      } catch (err) {
        console.error(`Assistant GAQL error for ${acc.id} (${acc.market}):`, err.message);
        firstError = err.message;
        return [];
      }
    })
  );

  const rows = results.flat();
  // If all accounts returned empty AND there was an error, throw so Gemini can retry
  if (rows.length === 0 && firstError) {
    throw new Error(`Google Ads API error: ${firstError}`);
  }

  return {
    rows,
    accounts_queried: accounts.map(a => `${a.brandLabel} ${a.market} (${a.id})`),
    query: gaql,
  };
}

// ─── GA4 execution ─────────────────────────────────────

function buildStreamFilter(brandKey, market) {
  if (!market || market === 'ALL') return null;

  const brandName = brandKey === 'COCOONCENTER' ? 'Cocooncenter'
    : brandKey === 'PASCAL_COSTE' ? 'Pascal Coste Shopping'
    : 'Parapharmacie Lafayette';

  const streamId = GA4_STREAMS[brandName]?.[market];
  if (!streamId) return null;

  return {
    filter: {
      fieldName: 'streamId',
      stringFilter: { value: streamId, matchType: 'EXACT' },
    },
  };
}

function parseGA4Rows(response, dimensions, metrics, brandKey) {
  if (!response?.rows) return [];
  return response.rows.map(row => {
    const entry = { _brand: brandKey };
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

async function executeGA4Query(intent) {
  const { ga4_query, brand_key, market } = intent;
  const { dimensions = ['date'], metrics, dateFrom, dateTo } = ga4_query;

  const accessToken = await getValidAccessToken();

  const propertyEntries = brand_key === 'ALL'
    ? Object.entries(BRAND_KEY_TO_PROPERTY)
    : [[brand_key, resolvePropertyId(brand_key, market)]].filter(([, v]) => v);

  let allRows = [];
  const queriedProperties = [];

  for (const [bKey, propertyId] of propertyEntries) {
    if (!propertyId) continue;

    const dimensionFilter = buildStreamFilter(bKey, market);

    const url = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
    const body = {
      dateRanges: [{ startDate: dateFrom, endDate: dateTo }],
      dimensions: dimensions.map(d => ({ name: d })),
      metrics: metrics.map(m => ({ name: m })),
    };
    if (dimensionFilter) body.dimensionFilter = dimensionFilter;

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
      throw new Error(`GA4 API ${res.status}: ${errText.slice(0, 300)}`);
    }

    const response = await res.json();
    const rows = parseGA4Rows(response, dimensions, metrics, bKey);
    allRows = allRows.concat(rows);
    queriedProperties.push(`${bKey} (${propertyId})`);
  }

  return {
    rows: allRows,
    properties_queried: queriedProperties,
    query: { dimensions, metrics, dateFrom, dateTo },
  };
}

// ─── Public dispatcher ─────────────────────────────────

export async function executeQuery(intent) {
  const { source } = intent;

  if (source === 'google_ads') {
    return executeGoogleAdsQuery(intent);
  }

  if (source === 'ga4') {
    return executeGA4Query(intent);
  }

  if (source === 'both') {
    const [adsResult, ga4Result] = await Promise.allSettled([
      executeGoogleAdsQuery(intent),
      executeGA4Query(intent),
    ]);

    // If both fail, throw the Google Ads error
    if (adsResult.status === 'rejected' && ga4Result.status === 'rejected') {
      throw new Error(adsResult.reason?.message || 'Both queries failed');
    }

    const ads = adsResult.status === 'fulfilled' ? adsResult.value : { rows: [], error: adsResult.reason?.message };
    const ga4 = ga4Result.status === 'fulfilled' ? ga4Result.value : { rows: [], error: ga4Result.reason?.message };

    return {
      google_ads: ads,
      ga4,
      rows: [...(ads.rows || []), ...(ga4.rows || [])],
      accounts_queried: ads.accounts_queried || [],
      properties_queried: ga4.properties_queried || [],
    };
  }

  throw new Error(`Source inconnue: ${source}`);
}
