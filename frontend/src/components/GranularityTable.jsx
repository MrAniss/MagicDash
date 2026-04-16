import { useState } from 'react';
import { useGranularity } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';
import { downloadCsv, copyTsv } from '../utils/exportTable';

const GRAN_OPTIONS = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

function deltaColor(v) {
  if (v > 0) return 'text-success';
  if (v < 0) return 'text-danger';
  return 'text-navy-muted';
}

function ExportButtons({ onCsv, onSheets, copied }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onCsv}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-inner bg-bg-page text-navy-muted hover:text-navy hover:bg-border transition-colors"
        title="Télécharger en CSV (Excel)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <path d="M8 11L3 6h3V1h4v5h3L8 11z" fill="currentColor"/>
          <path d="M1 13h14v2H1v-2z" fill="currentColor"/>
        </svg>
        CSV
      </button>
      <button onClick={onSheets}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-inner bg-bg-page text-navy-muted hover:text-navy hover:bg-border transition-colors"
        title="Copier pour Google Sheets (Ctrl+V dans une cellule)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <path d="M1 5h14M1 9h14M1 13h14M5 1v14M11 1v14" stroke="currentColor" strokeWidth="1"/>
        </svg>
        {copied ? 'Copié !' : 'Sheets'}
      </button>
    </div>
  );
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
  const [sortCol, setSortCol] = useState(null);
  const [sortDir, setSortDir] = useState('desc');
  const [copied, setCopied] = useState(false);

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

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const COLS = [
    { key: 'period',             label: 'PERIODE',  align: 'left', format: v => v },
    // ── Trafic ──
    { key: 'impressions',        label: 'IMPR.',    format: fNum },
    { key: 'delta_impressions',  label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
    { key: 'clicks',             label: 'CLICS',    format: fNum },
    { key: 'delta_clicks',       label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
    { key: 'cpc',                label: 'CPC',      format: v => fEur(v, true) },
    { key: 'delta_cpc',          label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, invert: true, isPct: true },
    { key: 'ctr',                label: 'CTR',      format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', isPct: true },
    { key: 'delta_ctr',          label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
    { key: 'cvr',                label: 'CVR',      format: fPct, isPct: true },
    { key: 'delta_cvr',          label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
    // ── Business ──
    { key: 'spend',              label: 'SPEND',    format: fEur },
    { key: 'delta_spend',        label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
    { key: 'revenue',            label: 'REVENUE',  format: fEur },
    { key: 'delta_revenue',      label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
    { key: 'roas',               label: 'ROAS',     format: fROAS },
    { key: 'delta_roas',         label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
    { key: 'conversions',        label: 'CONV.',    format: fNum },
    { key: 'delta_conversions',  label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
    { key: 'aov',                label: 'AOV',      format: fAov },
    { key: 'delta_aov',          label: '\u0394',   format: v => fDelta(v, 'pct'), isDelta: true, isPct: true },
  ];

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      <div className="px-6 py-5 pb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-navy">Detail par periode</h3>
        <div className="flex items-center gap-2">
          <ExportButtons
            onCsv={() => downloadCsv(COLS, rows, `detail-periode-${gran}.csv`)}
            onSheets={async () => { await copyTsv(COLS, rows); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            copied={copied}
          />
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {GRAN_OPTIONS.map(g => (
              <button key={g.key} onClick={() => { setGran(g.key); setSortCol(null); }}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${gran === g.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <div className="overflow-auto max-h-[480px]">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-bg-page border-b-2 border-border">
              {COLS.map((col, i) => (
                <th key={`${col.key}-${i}`} onClick={() => handleSort(col.key)}
                  className={`px-2.5 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy transition-colors select-none whitespace-nowrap bg-bg-page ${col.align === 'left' ? 'text-left' : 'text-right'}`}>
                  {col.label}
                  {sortCol === col.key && <span className="ml-0.5">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                {COLS.map((col, ci) => {
                  const val = row[col.key];
                  const formatted = col.format ? col.format(val) : val;
                  let cls = `px-2.5 py-2.5 whitespace-nowrap ${col.align === 'left' ? 'text-left' : 'text-right'}`;
                  if (col.isDelta) cls += ' text-xs font-medium ' + (col.invert ? deltaColor(-val) : deltaColor(val)) + ' group-hover:text-white';
                  else if (col.key === 'period') cls += ' font-medium text-navy group-hover:text-white';
                  else cls += ' text-navy group-hover:text-white';
                  return <td key={`${col.key}-${ci}`} className={cls}>{formatted}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
