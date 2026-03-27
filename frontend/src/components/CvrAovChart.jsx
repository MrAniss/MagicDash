import { useState, useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useGranularity, useGA4Trend } from '../hooks/useAdsData';
import { fPct, fAov, fNum } from '../utils/formatters';
import { fmt } from '../utils/dateHelpers';

const GRAN_OPTIONS = [
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

const SOURCE_OPTIONS = [
  { key: 'ads', label: 'Google Ads' },
  { key: 'ga4', label: 'GA4' },
];

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="skeleton h-4 w-64 mb-4" />
      <div className="skeleton h-64 w-full rounded-chart" />
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  return (
    <div className="bg-white border border-border-strong rounded-chart p-3 shadow-card">
      <p className="text-navy-muted text-xs mb-2">{label}</p>
      <p className="text-xs" style={{ color: '#1A2E4A' }}>
        <span className="font-medium">CVR:</span> {row?.cvr != null ? row.cvr.toFixed(2) + '%' : '—'}
      </p>
      <p className="text-xs" style={{ color: '#00E89A' }}>
        <span className="font-medium">Panier moyen:</span> {fAov(row?.aov)}
      </p>
      <p className="text-xs text-navy-muted mt-1">
        <span className="font-medium">Conversions:</span> {fNum(row?.conversions || row?.transactions)}
      </p>
    </div>
  );
}

export default function CvrAovChart({ filters }) {
  const [gran, setGran] = useState('week');
  const [source, setSource] = useState('ads');

  const ytdFrom = useMemo(() => {
    const year = new Date().getFullYear();
    return `${year}-01-01`;
  }, []);
  const ytdTo = useMemo(() => fmt(new Date()), []);

  // Google Ads data
  const adsQuery = useGranularity({
    brand: filters.brand,
    market: filters.market,
    from: ytdFrom,
    to: ytdTo,
    compareTo: 'previous_period',
    granularity: gran,
  });

  // GA4 data
  const ga4Query = useGA4Trend({
    brand: filters.brand,
    market: filters.market,
    from: ytdFrom,
    to: ytdTo,
    granularity: gran,
  });

  const isLoading = source === 'ads' ? adsQuery.isLoading : ga4Query.isLoading;
  const rawData = source === 'ads' ? adsQuery.data : ga4Query.data;

  if (isLoading || !rawData) return <Skeleton />;

  // Normalize data shape
  let chartData;
  if (source === 'ads') {
    // Data comes anti-chronological, reverse for chart
    chartData = [...rawData].reverse();
  } else {
    // GA4 trend data: already chronological, has date/cvr/aov/transactions
    chartData = rawData.map(d => ({ ...d, period: d.date }));
  }

  const dateKey = source === 'ads' ? 'period' : 'period';

  // Compute average CVR across the period
  const avgCvr = chartData.length > 0
    ? chartData.reduce((sum, d) => sum + (d.cvr || 0), 0) / chartData.length
    : 0;

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-navy">CVR & Panier moyen — depuis le 1er janvier</h3>
        <div className="flex items-center gap-2">
          {/* Source toggle */}
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {SOURCE_OPTIONS.map(s => (
              <button key={s.key} onClick={() => setSource(s.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${source === s.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                {s.label}
              </button>
            ))}
          </div>
          {/* Granularity toggle */}
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {GRAN_OPTIONS.map(g => (
              <button key={g.key} onClick={() => setGran(g.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${gran === g.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                {g.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 46, 74, 0.08)" />
          <XAxis dataKey={dateKey} tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={v => v.toFixed(1) + '%'} domain={['auto', 'auto']} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={v => `${Math.round(v)} €`} domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine yAxisId="left" y={avgCvr} stroke="#1A2E4A" strokeDasharray="6 4" strokeOpacity={0.4}
            label={{ value: `Moy. ${avgCvr.toFixed(2)}%`, position: 'right', fill: '#8896B0', fontSize: 10 }} />
          <Line yAxisId="left" type="monotone" dataKey="cvr" name="CVR" stroke="#1A2E4A" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="aov" name="Panier moyen" stroke="#00E89A" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
