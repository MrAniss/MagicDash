import { google } from 'googleapis';
import { getOAuth2Client } from './auth.js';

// ─── Config ────────────────────────────────────────────
const CONSOLIDATED_SHEET_ID = '1UWaoDHilweFsvamsvLyHrCMUxZ8izguMTnKNZ--fXtk';

const TABS = [
  { range: 'cc_raw_data',       brandKey: 'COCOONCENTER',              brandLabel: 'Cocooncenter' },
  { range: 'pcs_raw_data',      brandKey: 'PASCAL_COSTE',              brandLabel: 'Pascal Coste Shopping' },
  { range: 'paralaf_raw_data',  brandKey: 'PARAPHARMACIE_LAFAYETTE',   brandLabel: 'Parapharmacie Lafayette' },
];

// Brand filter name mapping (frontend sends brand key)
const BRAND_KEY_TO_LABEL = {};
for (const t of TABS) BRAND_KEY_TO_LABEL[t.brandKey] = t.brandLabel;

// ─── Cache ─────────────────────────────────────────────
let cachedRows = null;
let cacheTimestamp = 0;
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

// ─── Parsing helpers ───────────────────────────────────

/** Parse dd/mm/yyyy → YYYY-MM-DD */
function parseDate(val) {
  if (!val) return '';
  const s = String(val).trim();
  // Already ISO?
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Google Sheets serial number (days since 1899-12-30)
  const serial = Number(s);
  if (!isNaN(serial) && serial > 30000 && serial < 100000) {
    const d = new Date(Date.UTC(1899, 11, 30 + serial));
    return d.toISOString().slice(0, 10);
  }
  return '';
}

/** Parse French-formatted number: "1 234,56" → 1234.56, handles % */
function parseNum(val) {
  if (!val || val === '--' || val === '') return 0;
  const cleaned = String(val).replace(/[%€\s]/g, '').replace(',', '.');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

/** Map campaign type */
function mapCampaignType(rawType) {
  if (!rawType) return 'Other';
  const t = rawType.trim().toLowerCase();
  if (t.includes('performance max') || t === 'pmax') return 'PMax';
  if (t.includes('shopping')) return 'Shopping';
  if (t.includes('search') || t.includes('recherche')) return 'Search';
  if (t.includes('display')) return 'Display';
  if (t.includes('video')) return 'Video';
  if (t.includes('discovery') || t.includes('demand gen')) return 'Demand Gen';
  return 'Other';
}

/** Map status */
function mapStatus(rawStatus) {
  if (!rawStatus) return 'PAUSED';
  const s = rawStatus.trim().toLowerCase();
  if (s === 'active' || s === 'activée' || s === 'activé' || s === 'enabled') return 'Active';
  if (s === 'mise en veille' || s === 'paused' || s === 'suspendue') return 'Paused';
  if (s === 'supprimée' || s === 'removed') return 'Removed';
  return rawStatus.trim();
}

/** Parse comarket flag */
function parseComarket(val, campaignName) {
  if (val) {
    const s = String(val).trim().toLowerCase();
    if (s === 'oui' || s === 'yes' || s === 'true' || s === '1') return true;
    if (s === 'non' || s === 'no' || s === 'false' || s === '0') return false;
  }
  // Fallback: detect from campaign name
  return campaignName ? campaignName.toLowerCase().includes('comarket') : false;
}

// ─── Column index mapping (A=0, B=1, ..., AE=30) ──────
const COL = {
  date:         0,   // A - Jour
  account:      1,   // B - Compte
  brand:        2,   // C - Marque
  market:       3,   // D - Marché
  accountId:    4,   // E - ID Compte
  campaign:     5,   // F - Campagne
  campaignId:   6,   // G - ID Campagne
  budget:       7,   // H - Budget (€)
  budgetName:   8,   // I - Nom du budget
  budgetType:   9,   // J - Type de budget
  currency:     10,  // K - Code de la devise
  status:       11,  // L - État de la campagne
  statusEff:    12,  // M - État effectif
  statusReason: 13,  // N - Motifs de l'état
  campaignType: 14,  // O - Type de campagne
  bidStrategy:  15,  // P - Stratégie d'enchères
  bidType:      16,  // Q - Type de stratégie d'enchères
  targetRoas:   17,  // R - ROAS cible
  impressions:  18,  // S - Impr.
  clicks:       19,  // T - Clics
  ctr:          20,  // U - CTR (%)
  cost:         21,  // V - Coût
  costConverted:22,  // W - Coût (devise convertie)
  currencyConv: 23,  // X - Code devise convertie
  conversions:  24,  // Y - Conversions
  convValue:    25,  // Z - Valeur de conv.
  roas:         26,  // AA - ROAS
  poas:         27,  // AB - POAS
  marginSS:     28,  // AC - Marge Server Side
  clickShare:   29,  // AD - Part de clics (%)
  comarket:     30,  // AE - Comarket
};

// ─── Fetch all tabs ────────────────────────────────────

async function fetchAllTabs() {
  // Check cache
  if (cachedRows && (Date.now() - cacheTimestamp) < CACHE_TTL) {
    return cachedRows;
  }

  const auth = getOAuth2Client();
  const sheets = google.sheets({ version: 'v4', auth });

  // Read all 3 tabs in parallel
  const results = await Promise.all(
    TABS.map(tab =>
      sheets.spreadsheets.values.get({
        spreadsheetId: CONSOLIDATED_SHEET_ID,
        range: `${tab.range}!A:AE`,
      }).then(res => ({ tab, values: res.data.values || [] }))
    )
  );

  const allRows = [];

  for (const { tab, values } of results) {
    if (values.length < 2) continue; // skip empty tabs

    // Skip header row (index 0)
    for (let i = 1; i < values.length; i++) {
      const r = values[i];
      if (!r || r.length === 0) continue;

      const date = parseDate(r[COL.date]);
      if (!date) continue; // skip rows without valid date

      const campaignName = (r[COL.campaign] || '').trim();
      const marketRaw = (r[COL.market] || '').trim().toUpperCase();

      allRows.push({
        date,
        account:      (r[COL.account] || '').trim(),
        brand:        tab.brandKey,
        brandLabel:   tab.brandLabel,
        market:       marketRaw,
        accountId:    (r[COL.accountId] || '').trim(),
        campaign:     campaignName,
        campaignId:   (r[COL.campaignId] || '').trim(),
        budget:       parseNum(r[COL.budget]),
        budgetName:   (r[COL.budgetName] || '').trim(),
        budgetType:   (r[COL.budgetType] || '').trim(),
        currency:     (r[COL.currency] || 'EUR').trim(),
        campaign_status: mapStatus(r[COL.status]),
        statusEff:    (r[COL.statusEff] || '').trim(),
        campaign_type: mapCampaignType(r[COL.campaignType]),
        bidStrategy:  (r[COL.bidStrategy] || '').trim(),
        bidType:      (r[COL.bidType] || '').trim(),
        targetRoas:   parseNum(r[COL.targetRoas]),
        impressions:  Math.round(parseNum(r[COL.impressions])),
        clicks:       Math.round(parseNum(r[COL.clicks])),
        ctr:          parseNum(r[COL.ctr]),
        cost:         parseNum(r[COL.cost]),
        costConverted:parseNum(r[COL.costConverted]),
        conversions:  parseNum(r[COL.conversions]),
        conversion_value: parseNum(r[COL.convValue]),
        roas:         parseNum(r[COL.roas]),
        clickShare:   parseNum(r[COL.clickShare]),
        comarket:     parseComarket(r[COL.comarket], campaignName),
      });
    }
  }

  // Sort by date
  allRows.sort((a, b) => a.date.localeCompare(b.date));

  cachedRows = allRows;
  cacheTimestamp = Date.now();

  console.log(`Sheets loaded: ${allRows.length} rows from ${TABS.length} tabs`);
  return allRows;
}

// ─── Public API (same exports as before) ───────────────

/**
 * Get filtered rows
 */
export async function getRows({ brand = 'ALL', market = 'ALL', from, to, campaignType, includeComarket = false }) {
  let rows = await fetchAllTabs();

  // Filter by brand
  if (brand && brand !== 'ALL') {
    rows = rows.filter(r => r.brand === brand);
  }

  // Filter by date range
  if (from) rows = rows.filter(r => r.date >= from);
  if (to) rows = rows.filter(r => r.date <= to);

  // Filter by market
  if (market && market !== 'ALL') {
    rows = rows.filter(r => r.market === market);
  }

  // Filter by campaign type
  if (campaignType && campaignType !== 'ALL') {
    if (campaignType === 'DSA') {
      rows = rows.filter(r => r.campaign.toLowerCase().includes('dsa'));
    } else {
      rows = rows.filter(r => r.campaign_type === campaignType);
    }
  }

  // Comarket filter — exclude by default
  if (!includeComarket) {
    rows = rows.filter(r => !r.comarket);
  }

  return rows;
}

/**
 * Get only comarket rows (FR, Cocooncenter)
 */
export async function getComarketRows({ from, to }) {
  const allRows = await getRows({ brand: 'COCOONCENTER', market: 'FR', from, to, includeComarket: true });
  return allRows.filter(r => r.comarket);
}

/**
 * Aggregate metrics from rows
 */
export function aggregateMetrics(rows) {
  let spend = 0, revenue = 0, conversions = 0, clicks = 0, impressions = 0;

  for (const r of rows) {
    spend += r.cost;
    revenue += r.conversion_value;
    conversions += r.conversions;
    clicks += r.clicks;
    impressions += r.impressions;
  }

  const roas = spend > 0 ? revenue / spend : 0;
  const cvr = clicks > 0 ? (conversions / clicks) * 100 : 0;
  const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
  const aov = conversions > 0 ? revenue / conversions : 0;

  return {
    spend: Math.round(spend * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    roas: Math.round(roas * 100) / 100,
    conversions: Math.round(conversions * 100) / 100,
    cvr: Math.round(cvr * 100) / 100,
    clicks,
    impressions,
    ctr: Math.round(ctr * 100) / 100,
    aov: Math.round(aov * 100) / 100,
  };
}

/**
 * Group rows by a key function
 */
export function groupBy(rows, keyFn) {
  const groups = {};
  for (const r of rows) {
    const key = keyFn(r);
    if (!groups[key]) groups[key] = [];
    groups[key].push(r);
  }
  return groups;
}

/**
 * Clear cache
 */
export function clearCache() {
  cachedRows = null;
  cacheTimestamp = 0;
}
