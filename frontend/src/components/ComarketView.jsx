import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useComarketData } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fROAS, fDelta } from '../utils/formatters';

const KPI_CARDS = [
  { key: 'spend', label: 'SPEND COMARKET', format: fEur, deltaKey: 'spend_pct', deltaType: 'pct', accent: '#F5A623' },
  { key: 'revenue', label: 'REVENUE', format: fEur, deltaKey: 'revenue_pct', deltaType: 'pct', accent: '#00B87A' },
  { key: 'roas', label: 'ROAS', format: fROAS, deltaKey: 'roas_abs', deltaType: 'abs', accent: '#1A2E4A' },
  { key: 'conversions', label: 'CONVERSIONS', format: fNum, deltaKey: 'conversions_pct', deltaType: 'pct', accent: '#378ADD' },
  { key: 'ctr', label: 'CTR', format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', deltaKey: 'ctr_abs', deltaType: 'abs', accent: '#D4537E' },
];

const CAMPAIGN_COLS = [
  { key: 'campaign_name', label: 'CAMPAGNE', align: 'left', wide: true },
  { key: 'partner_brand', label: 'MARQUE PARTENAIRE', align: 'left' },
  { key: 'spend', label: 'SPEND', format: fEur, align: 'right' },
  { key: 'revenue', label: 'REVENUE', format: fEur, align: 'right' },
  { key: 'roas', label: 'ROAS', format: fROAS, align: 'right' },
  { key: 'conversions', label: 'CONV.', format: fNum, align: 'right' },
  { key: 'cvr', label: 'CVR', format: fPct, align: 'right' },
  { key: 'clicks', label: 'CLICS', format: fNum, align: 'right' },
  { key: 'ctr', label: 'CTR', format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', align: 'right' },
  { key: 'status', label: 'STATUT', align: 'left' },
];

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-5 gap-4">{Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-white rounded-card p-5 border border-border shadow-card"><div className="skeleton h-16 w-full" /></div>
      ))}</div>
      <div className="bg-white rounded-card p-6 border border-border shadow-card"><div className="skeleton h-64 w-full" /></div>
    </div>
  );
}

export default function ComarketView({ filters }) {
  const { data, isLoading } = useComarketData({ from: filters.from, to: filters.to, compareTo: filters.compareTo });
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');

  if (isLoading || !data) return <Skeleton />;

  const { kpis, campaigns = [], trend = [] } = data;
  const { current, previous, deltas, pctOfFR } = kpis;

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const sorted = [...campaigns].sort((a, b) => {
    const va = a[sortCol] ?? '';
    const vb = b[sortCol] ?? '';
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-navy">Campagnes Comarket</h2>
        <span className="text-[11px] font-medium px-2.5 py-1 rounded-[6px] bg-warning-bg text-warning">FR uniquement</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-5 gap-4">
        {KPI_CARDS.map(kpi => {
          const value = current[kpi.key];
          const delta = deltas[kpi.deltaKey];
          const isPositive = delta > 0;
          const isNegative = delta < 0;
          const dColor = isPositive ? 'text-success' : isNegative ? 'text-danger' : 'text-navy-muted';
          const arrow = isPositive ? '\u25B2' : isNegative ? '\u25BC' : '';

          return (
            <div key={kpi.key} className="bg-white rounded-card border border-border shadow-card overflow-hidden">
              <div className="h-[3px]" style={{ background: kpi.accent }} />
              <div className="px-5 py-4">
                <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-2">{kpi.label}</p>
                <p className="text-2xl font-bold text-navy mb-1">{kpi.format(value)}</p>
                <p className={`text-xs font-medium ${dColor} mb-0.5`}>
                  {arrow} {fDelta(delta, kpi.deltaType)}
                </p>
                {(kpi.key === 'spend' || kpi.key === 'revenue') && pctOfFR && (
                  <p className="text-[11px] text-navy-muted">
                    {pctOfFR[kpi.key]}% du total FR
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Trend */}
      <div className="bg-white rounded-card p-6 border border-border shadow-card">
        <h3 className="text-lg font-semibold text-navy mb-4">Trend Comarket</h3>
        {trend.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trend} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 46, 74, 0.08)" />
              <XAxis dataKey="date" tick={{ fill: '#8896B0', fontSize: 10 }} tickLine={false} axisLine={false} />
              <YAxis yAxisId="left" tick={{ fill: '#8896B0', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8896B0', fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(26,46,74,0.15)', borderRadius: 12, fontSize: 11, color: '#1A2E4A' }} />
              <Line yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke="#F5A623" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#00B87A" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <p className="text-navy-muted text-sm py-12 text-center">Aucune donnee Comarket sur cette periode</p>}
      </div>

      {/* Campaign table */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        <div className="px-6 py-5 pb-3">
          <h3 className="text-lg font-semibold text-navy">{campaigns.length} campagnes Comarket</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-bg-page border-b-2 border-border">
                {CAMPAIGN_COLS.map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className={`px-3 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy select-none whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {col.label}
                    {sortCol === col.key && <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={i} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                  {CAMPAIGN_COLS.map(col => {
                    const val = row[col.key];
                    const formatted = col.format ? col.format(val) : val;
                    let cls = `px-3 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                    if (col.key === 'roas') cls += ' font-medium ' + (val >= 4 ? 'text-success' : val >= 2.5 ? 'text-warning' : 'text-danger') + ' group-hover:text-white';
                    else if (col.key === 'status') {
                      return <td key={col.key} className={cls + ' group-hover:text-white'}>
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-[6px] ${val === 'ENABLED' ? 'bg-success-bg text-success' : 'bg-bg-page text-navy-muted'}`}>
                          {val === 'ENABLED' ? 'Active' : 'Pausee'}
                        </span>
                      </td>;
                    }
                    else if (col.key === 'partner_brand') cls += ' font-semibold text-warning group-hover:text-white';
                    else if (col.wide) cls += ' text-navy max-w-[250px] truncate group-hover:text-white';
                    else cls += ' text-navy group-hover:text-white';
                    return <td key={col.key} className={cls} title={col.wide ? val : undefined}>{formatted}</td>;
                  })}
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={CAMPAIGN_COLS.length} className="px-4 py-8 text-center text-navy-muted">Aucune campagne Comarket trouvee</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
