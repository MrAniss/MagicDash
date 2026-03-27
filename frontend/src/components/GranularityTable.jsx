import { useState } from 'react';
import { useGranularity } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';

const GRAN_OPTIONS = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

const PAGE_SIZE = 10;

function deltaColor(v) {
  if (v > 0) return 'text-success';
  if (v < 0) return 'text-danger';
  return 'text-navy-muted';
}

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="skeleton h-4 w-40 mb-4" />
      {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-8 w-full mb-2" />)}
    </div>
  );
}

export default function GranularityTable({ filters }) {
  const [gran, setGran] = useState('day');
  const [page, setPage] = useState(0);
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');

  const { data, isLoading } = useGranularity({
    brand: filters.brand,
    market: filters.market,
    from: filters.from,
    to: filters.to,
    compareTo: filters.compareTo,
    granularity: gran,
  });

  if (isLoading || !data) return <Skeleton />;

  let rows = [...data];
  if (sortCol) {
    rows.sort((a, b) => {
      const va = a[sortCol] ?? 0;
      const vb = b[sortCol] ?? 0;
      return sortDir === 'asc' ? va - vb : vb - va;
    });
  }

  const totalPages = gran === 'day' ? Math.ceil(rows.length / PAGE_SIZE) : 1;
  const displayRows = gran === 'day' ? rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE) : rows;

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const COLS = [
    { key: 'period', label: 'PERIODE', align: 'left', format: v => v },
    { key: 'spend', label: 'SPEND', format: fEur },
    { key: 'delta_spend', label: '\u0394', format: v => fDelta(v, 'pct'), isDelta: true },
    { key: 'revenue', label: 'REVENUE', format: fEur },
    { key: 'delta_revenue', label: '\u0394', format: v => fDelta(v, 'pct'), isDelta: true },
    { key: 'roas', label: 'ROAS', format: fROAS },
    { key: 'delta_roas', label: '\u0394', format: v => fDelta(v, 'abs'), isDelta: true },
    { key: 'conversions', label: 'CONV.', format: fNum },
    { key: 'delta_conversions', label: '\u0394', format: v => fDelta(v, 'pct'), isDelta: true },
    { key: 'cvr', label: 'CVR', format: fPct },
    { key: 'delta_cvr', label: '\u0394', format: v => fDelta(v, 'abs'), isDelta: true },
    { key: 'aov', label: 'AOV', format: fAov },
    { key: 'delta_aov', label: '\u0394', format: v => v != null && !isNaN(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)} \u20AC` : '\u2014', isDelta: true },
    { key: 'clicks', label: 'CLICS', format: fNum },
    { key: 'delta_clicks', label: '\u0394', format: v => fDelta(v, 'pct'), isDelta: true },
    { key: 'ctr', label: 'CTR', format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014' },
    { key: 'delta_ctr', label: '\u0394', format: v => fDelta(v, 'abs'), isDelta: true },
  ];

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      <div className="px-6 py-5 pb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-navy">Detail par periode</h3>
        <div className="flex bg-bg-page rounded-inner p-0.5">
          {GRAN_OPTIONS.map(g => (
            <button key={g.key} onClick={() => { setGran(g.key); setPage(0); setSortCol(null); }}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${gran === g.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="bg-bg-page border-b-2 border-border">
              {COLS.map((col, i) => (
                <th key={`${col.key}-${i}`} onClick={() => handleSort(col.key)}
                  className={`px-2.5 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy transition-colors select-none whitespace-nowrap ${col.align === 'left' ? 'text-left' : 'text-right'}`}>
                  {col.label}
                  {sortCol === col.key && <span className="ml-0.5">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row, i) => (
              <tr key={i} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                {COLS.map((col, ci) => {
                  const val = row[col.key];
                  const formatted = col.format ? col.format(val) : val;
                  let cls = `px-2.5 py-2.5 whitespace-nowrap ${col.align === 'left' ? 'text-left' : 'text-right'}`;
                  if (col.isDelta) cls += ' text-xs font-medium ' + deltaColor(val) + ' group-hover:text-white';
                  else if (col.key === 'period') cls += ' font-medium text-navy group-hover:text-white';
                  else cls += ' text-navy group-hover:text-white';
                  return <td key={`${col.key}-${ci}`} className={cls}>{formatted}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {gran === 'day' && totalPages > 1 && (
        <div className="px-6 py-3 flex items-center justify-between border-t border-border">
          <span className="text-[11px] text-navy-muted">Page {page + 1} / {totalPages}</span>
          <div className="flex gap-1">
            <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
              className="px-3 py-1 text-xs font-medium rounded-inner bg-bg-page text-navy-muted hover:text-navy disabled:opacity-30 transition-colors">Prec.</button>
            <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1}
              className="px-3 py-1 text-xs font-medium rounded-inner bg-bg-page text-navy-muted hover:text-navy disabled:opacity-30 transition-colors">Suiv.</button>
          </div>
        </div>
      )}
    </div>
  );
}
