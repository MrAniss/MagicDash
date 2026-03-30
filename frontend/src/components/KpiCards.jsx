import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';

// ─── KPI config — ordre : trafic d'abord, puis business ──────────────────────
const KPI_CONFIG = [
  { key: 'impressions', label: 'IMPRESSIONS',  format: fNum,  deltaKey: 'impressions_pct', neutral: true, accent: '#A78BFA' },
  { key: 'clicks',      label: 'CLICS',        format: fNum,  deltaKey: 'clicks_pct',      neutral: true, accent: '#60A5FA' },
  { key: 'cpc',         label: 'CPC',          format: v => fEur(v, true), deltaKey: 'cpc_pct', neutral: true, accent: '#F59E0B' },
  { key: 'ctr',         label: 'CTR',          format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', deltaKey: 'ctr_pct', neutral: true, accent: '#D4537E' },
  { key: 'cvr',         label: 'CVR',          format: fPct,  deltaKey: 'cvr_pct',         accent: '#1A2E4A' },
  { key: 'spend',       label: 'SPEND',        format: fEur,  deltaKey: 'spend_pct',       neutral: true, accent: '#378ADD' },
  { key: 'revenue',     label: 'REVENUE',      format: fEur,  deltaKey: 'revenue_pct',     accent: '#00E89A' },
  { key: 'roas',        label: 'ROAS',         format: fROAS, deltaKey: 'roas_pct',        accent: '#00B87A' },
  { key: 'conversions', label: 'CONVERSIONS',  format: fNum,  deltaKey: 'conversions_pct', accent: '#F5A623' },
  { key: 'aov',         label: 'PANIER MOYEN', format: fAov,  deltaKey: 'aov_pct',         accent: '#7F77DD' },
];

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-5 border border-border shadow-card">
      <div className="skeleton h-2.5 w-12 mb-3" />
      <div className="skeleton h-7 w-24 mb-2" />
      <div className="skeleton h-3 w-16" />
    </div>
  );
}

export default function KpiCards({ data, isLoading }) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-10 gap-4">
        {KPI_CONFIG.map(k => <Skeleton key={k.key} />)}
      </div>
    );
  }

  const { current, previous, deltas } = data;

  return (
    <div className="grid grid-cols-10 gap-4">
      {KPI_CONFIG.map(kpi => {
        const value    = current[kpi.key];
        const prevValue = previous[kpi.key];
        const delta    = deltas[kpi.deltaKey];
        const isPositive = delta > 0;
        const isNegative = delta < 0;

        let deltaColor = 'text-navy-muted';
        if (!kpi.neutral) {
          deltaColor = isPositive ? 'text-success' : isNegative ? 'text-danger' : 'text-navy-muted';
        }

        const arrow    = isPositive ? '\u25B2' : isNegative ? '\u25BC' : '';
        const deltaText = `${arrow} ${fDelta(delta, 'pct')}`;

        return (
          <div key={kpi.key} className="bg-white rounded-card border border-border shadow-card overflow-hidden">
            <div className="h-[3px]" style={{ background: kpi.accent }} />
            <div className="px-5 py-4">
              <p className="text-navy-muted text-[11px] font-medium uppercase tracking-[0.06em] mb-2">{kpi.label}</p>
              <p className="text-[26px] font-bold text-navy leading-tight mb-2">{kpi.format(value)}</p>
              <p className={`text-xs font-medium ${deltaColor} mb-0.5`}>
                {deltaText} <span className="text-navy-muted font-normal text-[10px]">vs periode</span>
              </p>
              <p className="text-navy-muted text-[11px]">{kpi.format(prevValue)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
