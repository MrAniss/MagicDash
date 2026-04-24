import { useState, useMemo } from 'react';
import {
  ComposedChart, Bar, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useGA4TrendYtd } from '../hooks/useAdsData';
import { fEur, fNum, fEurCompact, fCompact, fROAS, fPct, fAov } from '../utils/formatters';

const KPI_OPTIONS = [
  {
    value: 'roas',
    label: 'ROAS (GA4/Ads)',
    format: fROAS,
    axisFormat: v => v?.toFixed(1) + '×',
  },
  {
    value: 'sessions',
    label: 'Sessions',
    format: fNum,
    axisFormat: fCompact,
  },
  {
    value: 'revenue',
    label: 'Revenue (GA4)',
    format: fEur,
    axisFormat: fEurCompact,
  },
  {
    value: 'transactions',
    label: 'Transactions',
    format: fNum,
    axisFormat: fCompact,
  },
  {
    value: 'cvr',
    label: 'CVR (GA4)',
    format: fPct,
    axisFormat: v => v?.toFixed(1) + '%',
  },
  {
    value: 'aov',
    label: 'Panier moyen (GA4)',
    format: fAov,
    axisFormat: v => v != null ? Math.round(v) + ' €' : '—',
  },
];

const GRANULARITIES = [
  { value: 'day',   label: 'Jour' },
  { value: 'week',  label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

function CustomTooltip({ active, payload, label, kpiOption, seriesData }) {
  if (!active || !payload?.length) return null;

  const entry = seriesData?.find(d => d.label === label || d.period === label);
  const cost   = payload.find(p => p.dataKey === 'cost')?.value;
  const kpiVal = payload.find(p => p.dataKey === kpiOption?.value)?.value;

  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3 shadow-lg text-[12px] min-w-[160px]">
      <p className="font-semibold text-navy mb-2 text-[13px]">{entry?.label || label}</p>
      <div className="space-y-1">
        <p className="flex justify-between gap-4">
          <span className="text-navy-muted">Coût (Ads)</span>
          <span className="font-medium text-navy">{fEur(cost)}</span>
        </p>
        <p className="flex justify-between gap-4">
          <span className="text-navy-muted">{kpiOption?.label}</span>
          <span className="font-medium" style={{ color: '#00E89A' }}>{kpiOption?.format(kpiVal)}</span>
        </p>
        {kpiOption?.value !== 'revenue' && entry?.revenue != null && (
          <p className="flex justify-between gap-4 border-t border-border pt-1 mt-1">
            <span className="text-navy-muted">Revenue (GA4)</span>
            <span className="font-medium text-navy">{fEur(entry.revenue)}</span>
          </p>
        )}
      </div>
    </div>
  );
}

export default function GA4CostKpiChart({ filters, sourceMedium }) {
  const [selectedKpi, setSelectedKpi] = useState('roas');
  const [granularity, setGranularity]  = useState('week');

  const { data, isLoading, isPending, isError, error } = useGA4TrendYtd({
    brand:  filters.brand,
    market: filters.market,
    sourceMedium,
    granularity,
  });

  const kpiOption = useMemo(
    () => KPI_OPTIONS.find(o => o.value === selectedKpi),
    [selectedKpi]
  );

  if (isPending && isLoading) {
    return (
      <div className="bg-white rounded-card p-6 border border-border shadow-card">
        <div className="skeleton h-72 w-full" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      {/* Header row */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-navy">Coût Ads & Performance GA4 — YTD</h3>
          <div className="flex gap-0.5 bg-bg-page rounded-lg p-0.5">
            {GRANULARITIES.map(g => (
              <button
                key={g.value}
                onClick={() => setGranularity(g.value)}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                  granularity === g.value
                    ? 'bg-white text-navy shadow-sm'
                    : 'text-navy-muted hover:text-navy'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-navy-muted">Coût Ads +</span>
          <div className="relative">
            <select
              value={selectedKpi}
              onChange={e => setSelectedKpi(e.target.value)}
              className="text-[13px] font-medium text-navy border border-border rounded-lg px-3 py-1.5 pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-navy/20 appearance-none cursor-pointer"
              style={{ color: '#00E89A', borderColor: '#00E89A33' }}
            >
              {KPI_OPTIONS.map(o => (
                <option key={o.value} value={o.value} style={{ color: '#1A2E4A' }}>{o.label}</option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-navy-muted">▾</span>
          </div>
        </div>
      </div>

      <div className="flex gap-4 mb-3">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm" style={{ background: '#1A2E4A' }} />
          <span className="text-[11px] text-navy-muted">Coût Ads (€)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-0.5 rounded" style={{ background: '#00E89A' }} />
          <span className="text-[11px] text-navy-muted">{kpiOption?.label}</span>
        </div>
      </div>

      {data && data.length > 0 ? (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 5, right: 55, bottom: 5, left: 55 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,46,74,0.07)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#8896B0', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tickFormatter={(val) => typeof val === 'string' ? val.split(' (')[0] : val}
            />
            <YAxis
              yAxisId="left"
              tick={{ fill: '#8896B0', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={fEurCompact}
              width={52}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              tick={{ fill: '#8896B0', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={kpiOption?.axisFormat}
              width={52}
            />
            <Tooltip
              content={<CustomTooltip kpiOption={kpiOption} seriesData={data} />}
              cursor={{ fill: 'rgba(26,46,74,0.04)' }}
            />
            <Bar
              yAxisId="left"
              dataKey="cost"
              name="Coût Ads"
              fill="#1A2E4A"
              radius={[3, 3, 0, 0]}
              maxBarSize={36}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey={selectedKpi}
              name={kpiOption?.label}
              stroke="#00E89A"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: '#00E89A', stroke: '#fff', strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-72 flex flex-col items-center justify-center gap-2">
          {isError ? (
            <>
              <p className="text-danger text-sm font-medium">Erreur de chargement</p>
              <p className="text-navy-muted text-[12px]">{error?.message || 'Echec du chargement des données YTD'}</p>
            </>
          ) : (
            <p className="text-navy-muted text-sm">Aucune donnee YTD disponible</p>
          )}
        </div>
      )}
    </div>
  );
}
