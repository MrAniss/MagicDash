// Demo mock for backend/services/budgetSheetReader.js. Returns monthly
// budgets that are ~5% above the modeled ad spend so the BudgetPacing UI
// shows realistic over/under headroom.

import { DEMO_BRANDS, findBrand, DEMO_BRAND_LABELS } from './demoConfig.js';
import { dailyMetrics } from './demoSeed.js';

function daysInMonth(yearMonth) {
  const [y, m] = yearMonth.split('-').map(n => parseInt(n, 10));
  return new Date(y, m, 0).getDate();
}

function aggregateMonthSpend(brand, market, yearMonth) {
  const days = daysInMonth(yearMonth);
  let total = 0;
  for (let d = 1; d <= days; d++) {
    const dateStr = `${yearMonth}-${String(d).padStart(2, '0')}`;
    total += dailyMetrics(brand, market, dateStr).spend;
  }
  return total;
}

// ─── Public API ────────────────────────────────────────────

export async function getBudgetForMonth(yearMonth) {
  const out = {};
  for (const b of DEMO_BRANDS) {
    const label = DEMO_BRAND_LABELS[b.key] || b.label;
    if (!out[label]) out[label] = {};
    for (const m of b.markets) {
      const spend = aggregateMonthSpend(b.key, m.code, yearMonth);
      out[label][m.code] = Math.round(spend * 1.05);
    }
  }
  return out;
}

export async function getBrandBBudgetForMonth(yearMonth) {
  const bKey = 'BRAND_B';
  const bDef = findBrand(bKey);
  if (!bDef) return {};
  const out = { [DEMO_BRAND_LABELS[bKey] || bDef.label]: {} };
  for (const m of bDef.markets) {
    const spend = aggregateMonthSpend(bKey, m.code, yearMonth);
    out[DEMO_BRAND_LABELS[bKey]][m.code] = Math.round(spend * 1.05);
  }
  return out;
}

export function clearBudgetCache() { /* no-op in demo */ }
