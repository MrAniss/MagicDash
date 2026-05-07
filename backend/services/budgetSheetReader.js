import { google } from 'googleapis';
import { getOAuth2Client } from '../auth.js';
import { BUDGET_MARKET_MAP } from '../config/budgetMarketMap.js';
import { isDemoMode } from './demo/demoMode.js';
import * as __demoBudget from './demo/demoBudget.js';

// Read lazily — process.env isn't populated at module-eval time because ES
// module imports are hoisted above server.js's dotenv.config() call.
function getBudgetSheetId() {
  const id = process.env.BUDGET_SHEET_ID;
  if (!id) {
    throw new Error('BUDGET_SHEET_ID not set in .env — see .env.example');
  }
  return id;
}

const TAB_NAME = 'Raw_Import';

// Cache: 1 hour TTL
let cachedData = null;
let cacheTs = 0;
const CACHE_TTL = 60 * 60 * 1000;

function parseEuro(str) {
  if (!str) return 0;
  const clean = String(str).replace(/[€\s\u00a0]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

/**
 * Budget column for month M (1=Jan, 12=Dec):
 *   Col 0 = market code
 *   Cols 1-4 = TOTAL annuel (Budget / Verif / Estimé / Réel)
 *   Col 5 = Janvier Budget, Col 6 = Janvier Estimé, Col 7 = Janvier Réel
 *   Col 8 = Février Budget, ...
 *   Formula: 5 + (M - 1) * 3
 */
function getBudgetColForMonth(monthNum) {
  return 5 + (monthNum - 1) * 3;
}

async function fetchSheetData() {
  if (cachedData && (Date.now() - cacheTs) < CACHE_TTL) {
    return cachedData;
  }

  const auth = getOAuth2Client();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBudgetSheetId(),
    range: `${TAB_NAME}`,
  });

  const rows = res.data.values || [];
  cachedData = rows;
  cacheTs = Date.now();
  return rows;
}

/**
 * Get budget data for a given month
 * @param {string} yearMonth - 'YYYY-MM'
 * @returns {Object} { 'Brand Alpha': { 'FR': 45000, ... }, 'Brand Gamma': { 'FR': 41604 } }
 */
export async function getBudgetForMonth(yearMonth) {
  if (isDemoMode()) return __demoBudget.getBudgetForMonth(yearMonth);
  const rows = await fetchSheetData();
  if (rows.length < 3) return {};

  const [, monthStr] = yearMonth.split('-');
  const monthNum = parseInt(monthStr, 10); // 1-12
  const budgetCol = getBudgetColForMonth(monthNum);

  const result = {};
  let inGoogleSection = false;

  // Data rows start at index 2 (row 3 in Sheet = "SEA - Google" total line)
  for (let i = 2; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[0]) continue;

    const rawCode = String(row[0]);
    const trimmedCode = rawCode.trim();

    // Track which section we're in — only process "SEA - Google" section
    if (trimmedCode === 'SEA - Google') {
      inGoogleSection = true;
      continue; // skip the total line itself
    }
    // If we hit another top-level section (no leading spaces), stop
    if (rawCode === trimmedCode && trimmedCode.length > 0 && inGoogleSection) {
      // This is a new section header (e.g. "SEA - Bing")
      inGoogleSection = false;
      continue;
    }

    if (!inGoogleSection) continue;

    const mapping = BUDGET_MARKET_MAP[trimmedCode];

    // null = explicitly ignored, undefined = unknown code — skip both
    if (mapping === null || mapping === undefined) continue;

    const budgetValue = parseEuro(row[budgetCol]);
    const { brand, markets } = mapping;

    if (!result[brand]) result[brand] = {};

    if (markets.length === 1) {
      result[brand][markets[0]] = budgetValue;
    } else {
      // "Autres pays" — store under that label
      result[brand]['Autres pays'] = budgetValue;
    }
  }

  return result;
}

// ─── Brand B Budget (onglet Brand_B_Budget) ───

const BRAND_B_TAB = 'Brand_B_Budget';
let brandBCachedData = null;
let brandBCacheTs = 0;

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

async function fetchBrandBSheetData() {
  if (brandBCachedData && (Date.now() - brandBCacheTs) < CACHE_TTL) {
    return brandBCachedData;
  }

  const auth = getOAuth2Client();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: getBudgetSheetId(),
    range: `${BRAND_B_TAB}`,
  });

  const rows = res.data.values || [];
  brandBCachedData = rows;
  brandBCacheTs = Date.now();
  return rows;
}

/**
 * Brand_B_Budget format:
 *   Row 0 (line 1): "Budget marketing 2026 / TOTAL / Janvier / Février ..."
 *   Row 1 (line 2): "montant € HT / Budget / Réel / Budget / Réel ..."
 *   Row 2 (line 3): "SEA - Google / <total> / <total réel> / <jan budget> / <jan réel> / <feb budget> ..."
 *   Row 3 (line 4): "SEA - Bing / ..."  ← ignored
 *
 * Two columns per month: Budget + Réel.
 * We locate the Budget column by scanning row 1 (headers line 2) for the month name
 * and picking the "Budget" sub-column under it.
 */
export async function getBrandBBudgetForMonth(yearMonth) {
  if (isDemoMode()) return __demoBudget.getBrandBBudgetForMonth(yearMonth);
  const rows = await fetchBrandBSheetData();
  if (rows.length < 3) return {};

  const [, monthStr] = yearMonth.split('-');
  const monthNum = parseInt(monthStr, 10); // 1-12
  const monthName = MONTH_NAMES[monthNum - 1];

  // Row 0 has month names — find the column index for the target month
  const headerRow = rows[0] || [];
  const subHeaderRow = rows[1] || [];

  // Find column where the month name appears in row 0
  let monthStartCol = -1;
  for (let c = 0; c < headerRow.length; c++) {
    const cell = String(headerRow[c] || '').trim();
    if (cell.toLowerCase() === monthName.toLowerCase()) {
      monthStartCol = c;
      break;
    }
  }

  if (monthStartCol === -1) return {};

  // Under that month header, find the "Budget" sub-column in row 1
  // Merged cells mean only the first col under the month has the month name,
  // subsequent cols are empty in row 0 until the next month.
  // In row 1, look for "Budget" starting at monthStartCol.
  let budgetCol = monthStartCol; // default: first col under the month
  for (let c = monthStartCol; c < subHeaderRow.length; c++) {
    // Stop if we hit the next month header
    if (c > monthStartCol && headerRow[c] && String(headerRow[c]).trim().length > 0) break;
    const sub = String(subHeaderRow[c] || '').trim().toLowerCase();
    if (sub === 'budget') {
      budgetCol = c;
      break;
    }
  }

  // Row 2 (index 2) = "SEA - Google" data
  const dataRow = rows[2] || [];
  const label = String(dataRow[0] || '').trim();
  if (!label.includes('SEA') || !label.includes('Google')) {
    // Try row 3 in case layout is slightly different
    const alt = rows[3] || [];
    const altLabel = String(alt[0] || '').trim();
    if (altLabel.includes('SEA') && altLabel.includes('Google')) {
      const value = parseEuro(alt[budgetCol]);
      return { 'Brand Beta': { 'FR': value } };
    }
    return {};
  }

  const value = parseEuro(dataRow[budgetCol]);
  return { 'Brand Beta': { 'FR': value } };
}

export function clearBudgetCache() {
  if (isDemoMode()) return __demoBudget.clearBudgetCache();
  cachedData = null;
  cacheTs = 0;
  brandBCachedData = null;
  brandBCacheTs = 0;
}
