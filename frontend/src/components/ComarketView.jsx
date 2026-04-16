import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useComarketData } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fROAS } from '../utils/formatters';

// ── Ordered: Impressions → Clics → CTR → Coût → CPC → Conversions → Revenue → CVR → ROAS
const KPI_CARDS = [
  { key: 'impressions', label: 'IMPRESSIONS', format: fNum,  deltaKey: 'impressions_pct', deltaType: 'pct', accent: '#8896B0' },
  { key: 'clicks',      label: 'CLICS',        format: fNum,  deltaKey: 'clicks_pct',      deltaType: 'pct', accent: '#378ADD' },
  { key: 'ctr',         label: 'CTR',           format: fCtr,  deltaKey: 'ctr_pct',          deltaType: 'pct', accent: '#D4537E' },
  { key: 'spend',       label: 'COÛT',          format: fEur,  deltaKey: 'spend_pct',        deltaType: 'pct', accent: '#F5A623' },
  { key: 'cpc',         label: 'CPC',           format: fEur,  deltaKey: 'cpc_pct',          deltaType: 'pct', accent: '#9B59B6' },
  { key: 'conversions', label: 'CONVERSIONS',   format: fNum,  deltaKey: 'conversions_pct',  deltaType: 'pct', accent: '#1A2E4A' },
  { key: 'revenue',     label: 'REVENUE',       format: fEur,  deltaKey: 'revenue_pct',      deltaType: 'pct', accent: '#00B87A' },
  { key: 'cvr',         label: 'CVR',           format: fPct,  deltaKey: 'cvr_pct',          deltaType: 'pct', accent: '#E67E22' },
  { key: 'roas',        label: 'ROAS',          format: fROAS, deltaKey: 'roas_pct',          deltaType: 'pct', accent: '#00E89A' },
];

// ── Same order in campaign table
const CAMPAIGN_COLS = [
  { key: 'campaign_name', label: 'CAMPAGNE',   align: 'left', wide: true },
  { key: 'partner_brand', label: 'MARQUE',     align: 'left' },
  { key: 'impressions',   label: 'IMPR. Δ',   format: fNum,  delta: 'delta_impressions', deltaType: 'pct', align: 'right' },
  { key: 'clicks',        label: 'CLICS Δ',   format: fNum,  delta: 'delta_clicks',      deltaType: 'pct', align: 'right' },
  { key: 'ctr',           label: 'CTR Δ',     format: fCtr,  delta: 'delta_ctr',         deltaType: 'pct', align: 'right' },
  { key: 'spend',         label: 'COÛT Δ',    format: fEur,  delta: 'delta_spend',       deltaType: 'pct', align: 'right' },
  { key: 'cpc',           label: 'CPC Δ',     format: fEur,  delta: 'delta_cpc',         deltaType: 'pct', align: 'right' },
  { key: 'conversions',   label: 'CONV. Δ',   format: fNum,  delta: 'delta_conversions', deltaType: 'pct', align: 'right' },
  { key: 'revenue',       label: 'REVENUE Δ', format: fEur,  delta: 'delta_revenue',     deltaType: 'pct', align: 'right' },
  { key: 'cvr',           label: 'CVR Δ',     format: fPct,  delta: 'delta_cvr',         deltaType: 'pct', align: 'right' },
  { key: 'roas',          label: 'ROAS Δ',    format: fROAS, delta: 'delta_roas',        deltaType: 'pct', align: 'right' },
  { key: 'status',        label: 'STATUT',    align: 'left' },
];

function fCtr(v) {
  return v != null && !isNaN(v) ? v.toFixed(2) + '%' : '—';
}

function fDeltaVal(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(1) + '%';
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 xl:grid-cols-9 gap-3">{Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="bg-white rounded-card p-4 border border-border shadow-card"><div className="skeleton h-16 w-full" /></div>
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

      {/* KPI Scorecards — 9 colonnes */}
      <div className="grid grid-cols-3 xl:grid-cols-9 gap-3">
        {KPI_CARDS.map(kpi => {
          const value   = current[kpi.key];
          const prevVal = previous[kpi.key];
          const delta   = deltas[kpi.deltaKey];
          const isPos   = delta > 0;
          const isNeg   = delta < 0;
          const dColor  = isPos ? 'text-success' : isNeg ? 'text-danger' : 'text-navy-muted';
          const arrow   = isPos ? '▲' : isNeg ? '▼' : '';

          return (
            <div key={kpi.key} className="bg-white rounded-card border border-border shadow-card overflow-hidden">
              <div className="h-[3px]" style={{ background: kpi.accent }} />
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-1.5 truncate">{kpi.label}</p>
                <p className="text-xl font-bold text-navy mb-1 leading-tight">{kpi.format(value)}</p>
                <p className={`text-[11px] font-medium ${dColor} mb-0.5`}>
                  {arrow} {fDeltaVal(delta)}
                </p>
                <p className="text-[11px] text-navy-muted">{kpi.format(prevVal)}</p>
                {(kpi.key === 'spend' || kpi.key === 'revenue') && pctOfFR && (
                  <p className="text-[10px] text-navy-muted mt-0.5">{pctOfFR[kpi.key]}% du FR</p>
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
              <Line yAxisId="left"  type="monotone" dataKey="spend"   name="Coût"    stroke="#F5A623" strokeWidth={2} dot={false} />
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
                    {sortCol === col.key && <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => (
                <tr key={i} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                  {CAMPAIGN_COLS.map(col => {
                    const val = row[col.key];

                    if (col.key === 'status') {
                      return (
                        <td key={col.key} className="px-3 py-2.5 whitespace-nowrap text-left group-hover:text-white">
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-[6px] ${val === 'ENABLED' ? 'bg-success-bg text-success' : 'bg-bg-page text-navy-muted'}`}>
                            {val === 'ENABLED' ? 'Active' : 'Pausee'}
                          </span>
                        </td>
                      );
                    }

                    if (col.key === 'campaign_name') {
                      return (
                        <td key={col.key} className="px-3 py-2.5 whitespace-nowrap text-left text-navy max-w-[220px] truncate group-hover:text-white" title={val}>
                          {val}
                        </td>
                      );
                    }

                    if (col.key === 'partner_brand') {
                      return (
                        <td key={col.key} className="px-3 py-2.5 whitespace-nowrap text-left font-semibold text-warning group-hover:text-white">
                          {val}
                        </td>
                      );
                    }

                    // Metric column — value + delta
                    const formatted = col.format ? col.format(val) : val;
                    const dVal = col.delta ? row[col.delta] : null;
                    const isPos = dVal > 0;
                    const isNeg = dVal < 0;
                    let valueColor = 'text-navy';
                    if (col.key === 'roas') valueColor = val >= 4 ? 'text-success' : val >= 2.5 ? 'text-warning' : 'text-danger';
                    const dColor = isPos ? 'text-success' : isNeg ? 'text-danger' : 'text-navy-muted';

                    return (
                      <td key={col.key} className={`px-3 py-2.5 whitespace-nowrap text-right group-hover:text-white`}>
                        <div className={`${valueColor} group-hover:text-white`}>{formatted}</div>
                        {col.delta && dVal != null && (
                          <div className={`text-[10px] ${dColor} group-hover:text-white/70`}>
                            {isPos ? '▲' : isNeg ? '▼' : ''} {fDeltaVal(dVal)}
                          </div>
                        )}
                      </td>
                    );
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
