import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { fEur, fROAS } from '../utils/formatters';
import { useTrend } from '../hooks/useAdsData';

const GRAN_OPTIONS = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
];

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="skeleton h-4 w-32 mb-4" />
      <div className="skeleton h-64 w-full rounded-chart" />
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border-strong rounded-chart p-3 shadow-card">
      <p className="text-navy-muted text-xs mb-2">{label}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs" style={{ color: entry.color }}>
          <span className="font-medium">{entry.name}:</span>{' '}
          {entry.name.includes('Revenue') || entry.name.includes('Spend') ? fEur(entry.value, true) : fROAS(entry.value)}
        </p>
      ))}
    </div>
  );
}

export default function TrendChart({ filters }) {
  const [granularity, setGranularity] = useState('day');

  const { data, isLoading } = useTrend({ ...filters, granularity });

  if (isLoading || !data) return <Skeleton />;

  const { current = [], previous = [] } = data;

  const merged = current.map((item, i) => ({
    date: item.date,
    spend: item.spend,
    revenue: item.revenue,
    roas: item.roas,
    prev_spend: previous[i]?.spend || 0,
    prev_revenue: previous[i]?.revenue || 0,
    prev_roas: previous[i]?.roas || 0,
  }));

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-navy">Performance Trend</h3>
        <div className="flex bg-bg-page rounded-inner p-0.5">
          {GRAN_OPTIONS.map(opt => (
            <button key={opt.key} onClick={() => setGranularity(opt.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${granularity === opt.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={merged} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 46, 74, 0.08)" />
          <XAxis dataKey="date" tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: 11, color: '#8896B0' }} />

          <Line yAxisId="left" type="monotone" dataKey="spend" name="Spend" stroke="#378ADD" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue" stroke="#00B87A" strokeWidth={2} dot={false} />

          <Line yAxisId="left" type="monotone" dataKey="prev_spend" name="Spend (comp.)" stroke="#378ADD" strokeWidth={1.5} strokeDasharray="4 4" dot={false} opacity={0.4} />
          <Line yAxisId="right" type="monotone" dataKey="prev_revenue" name="Revenue (comp.)" stroke="#00B87A" strokeWidth={1.5} strokeDasharray="4 4" dot={false} opacity={0.4} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
