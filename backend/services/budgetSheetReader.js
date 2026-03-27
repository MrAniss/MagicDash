import { google } from 'googleapis';
import { getOAuth2Client } from '../auth.js';
import { BUDGET_MARKET_MAP } from '../config/budgetMarketMap.js';

const BUDGET_SHEET_ID = '1UJX7ldlXAhS_e50Hjz7pK99KiBVBUxkyDoWJXuYauro';
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
    spreadsheetId: BUDGET_SHEET_ID,
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
 * @returns {Object} { 'Cocooncenter': { 'FR': 45000, ... }, 'Parapharmacie Lafayette': { 'FR': 41604 } }
 */
export async function getBudgetForMonth(yearMonth) {
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

// ─── PCS Budget (onglet PCS_Budget) ───

const PCS_TAB = 'PCS_Budget';
let pcsCachedData = null;
let pcsCacheTs = 0;

const MONTH_NAMES = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

async function fetchPCSSheetData() {
  if (pcsCachedData && (Date.now() - pcsCacheTs) < CACHE_TTL) {
    return pcsCachedData;
  }

  const auth = getOAuth2Client();
  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: BUDGET_SHEET_ID,
    range: `${PCS_TAB}`,
  });

  const rows = res.data.values || [];
  pcsCachedData = rows;
  pcsCacheTs = Date.now();
  return rows;
}

/**
 * PCS_Budget format:
 *   Row 0 (line 1): "Budget marketing 2026 / TOTAL / Janvier / Février ..."
 *   Row 1 (line 2): "montant € HT / Budget / Réel / Budget / Réel ..."
 *   Row 2 (line 3): "SEA - Google / <total> / <total réel> / <jan budget> / <jan réel> / <feb budget> ..."
 *   Row 3 (line 4): "SEA - Bing / ..."  ← ignored
 *
 * Two columns per month: Budget + Réel.
 * We locate the Budget column by scanning row 1 (headers line 2) for the month name
 * and picking the "Budget" sub-column under it.
 */
export async function getPCSBudgetForMonth(yearMonth) {
  const rows = await fetchPCSSheetData();
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
      return { 'Pascal Coste Shopping': { 'FR': value } };
    }
    return {};
  }

  const value = parseEuro(dataRow[budgetCol]);
  return { 'Pascal Coste Shopping': { 'FR': value } };
}

export function clearBudgetCache() {
  cachedData = null;
  cacheTs = 0;
  pcsCachedData = null;
  pcsCacheTs = 0;
}
