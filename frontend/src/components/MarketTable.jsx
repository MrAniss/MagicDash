import { useState } from 'react';
import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';
import { MarketLabel } from '../utils/flags';

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="skeleton h-4 w-40 mb-4" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton h-8 w-full mb-2" />
      ))}
    </div>
  );
}

const COLUMNS = [
  { key: 'label',            label: 'MARCHE',       align: 'left' },
  // ── Trafic ──
  { key: 'impressions',      label: 'IMPR.',         format: fNum,  align: 'right' },
  { key: 'clicks',           label: 'CLICS',         format: fNum,  align: 'right' },
  { key: 'cpc',             label: 'CPC',           format: v => fEur(v, true), align: 'right' },
  { key: 'ctr',              label: 'CTR',           format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', align: 'right' },
  { key: 'cvr',              label: 'CVR',           format: fPct,  align: 'right' },
  // ── Business ──
  { key: 'spend',            label: 'SPEND',         format: fEur,  align: 'right' },
  { key: 'revenue',          label: 'REVENUE',       format: fEur,  align: 'right' },
  { key: 'roas',             label: 'ROAS',          format: fROAS, align: 'right', colorCode: true },
  { key: 'conversions',      label: 'CONV.',         format: fNum,  align: 'right' },
  { key: 'aov',              label: 'PANIER MOY.',   format: fAov,  align: 'right' },
  // ── Deltas ──
  { key: 'delta_impressions',label: '\u0394 IMPR.',  format: v => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'delta_spend',      label: '\u0394 SPEND',  format: v => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'delta_clicks',     label: '\u0394 CLICS',  format: v => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'delta_cpc',        label: '\u0394 CPC',    format: v => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'delta_ctr',        label: '\u0394 CTR',    format: v => fDelta(v, 'abs'), align: 'right', isDelta: true },
  { key: 'delta_roas',       label: '\u0394 ROAS',   format: v => fDelta(v, 'abs'), align: 'right', isDelta: true },
  { key: 'delta_aov',        label: '\u0394 AOV',    format: v => v != null && !isNaN(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)} \u20AC` : '\u2014', align: 'right', isDelta: true },
];

function roasColor(roas) {
  if (roas >= 4.0) return 'text-success';
  if (roas >= 2.5) return 'text-warning';
  return 'text-danger';
}

function deltaColor(value) {
  if (value > 0) return 'text-success';
  if (value < 0) return 'text-danger';
  return 'text-navy-muted';
}

export default function MarketTable({ data, isLoading }) {
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');

  if (isLoading || !data) return <Skeleton />;

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const sorted = [...data].sort((a, b) => {
    const va = a[sortCol] ?? 0;
    const vb = b[sortCol] ?? 0;
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      <div className="px-6 py-5 pb-3">
        <h3 className="text-lg font-semibold text-navy">Performance par marche</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-bg-page border-b-2 border-border">
              {COLUMNS.map(col => (
                <th key={col.key} onClick={() => handleSort(col.key)}
                  className={`px-3 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy transition-colors select-none whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                  {col.label}
                  {sortCol === col.key && <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={`${row.market}-${i}`} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                {COLUMNS.map(col => {
                  const val = row[col.key];
                  const formatted = col.format ? col.format(val) : val;
                  let className = `px-3 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                  if (col.colorCode) className += ' font-medium ' + roasColor(val) + ' group-hover:text-white';
                  else if (col.isDelta) className += ' text-xs font-medium ' + deltaColor(val) + ' group-hover:text-white';
                  else if (col.key === 'label') className += ' font-medium text-navy group-hover:text-white';
                  else className += ' text-navy group-hover:text-white';
                  if (col.key === 'label') {
                    return <td key={col.key} className={className}><MarketLabel market={row.market || formatted} showFullName /> </td>;
                  }
                  return <td key={col.key} className={className}>{formatted}</td>;
                })}
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-navy-muted">Aucune donnee</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
