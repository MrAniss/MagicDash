const eurFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 });
const eurDetailFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const numFormatter = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pctFormatter = new Intl.NumberFormat('fr-FR', { style: 'percent', minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function fEur(value, detailed = false) {
  if (value == null || isNaN(value)) return '—';
  return detailed ? eurDetailFormatter.format(value) : eurFormatter.format(value);
}

export function fNum(value) {
  if (value == null || isNaN(value)) return '—';
  return numFormatter.format(value);
}

export function fPct(value) {
  if (value == null || isNaN(value)) return '—';
  return pctFormatter.format(value / 100);
}

export function fROAS(value) {
  if (value == null || isNaN(value)) return '—';
  return value.toFixed(2) + 'x';
}

export function fAov(value) {
  if (value == null || isNaN(value) || value === 0) return '—';
  return eurDetailFormatter.format(value);
}

// Compact : 1 234 567 → 1,2M | 45 300 → 45,3K
export function fCompact(value) {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1).replace('.', ',') + 'M';
  if (value >= 10_000)    return Math.round(value / 1_000).toFixed(0) + 'K';
  if (value >= 1_000)     return (value / 1_000).toFixed(1).replace('.', ',') + 'K';
  return numFormatter.format(value);
}

// Compact euros : 1 234 567 € → 1,2M€ | 45 300 € → 45,3K€
export function fEurCompact(value) {
  if (value == null || isNaN(value)) return '—';
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1).replace('.', ',') + 'M€';
  if (value >= 10_000)    return Math.round(value / 1_000).toFixed(0) + 'K€';
  if (value >= 1_000)     return (value / 1_000).toFixed(1).replace('.', ',') + 'K€';
  return eurFormatter.format(value);
}

export function fDelta(value, type = 'pct') {
  if (value == null || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  if (type === 'abs') return sign + value.toFixed(2);
  return sign + value.toFixed(1) + '%';
}
