import { useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from 'recharts';
import { useGA4CvrAovYtd } from '../hooks/useAdsData';
import { fAov } from '../utils/formatters';

// ─── Helpers ────────────────────────────────────────────

function isoWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const jan4 = new Date(d.getFullYear(), 0, 4);
  const startOfW1 = new Date(jan4);
  startOfW1.setDate(jan4.getDate() - ((jan4.getDay() + 6) % 7));
  return Math.round((d - startOfW1) / (7 * 24 * 60 * 60 * 1000)) + 1;
}

function weekLabel(dateStr) {
  return `S${String(isoWeekNumber(dateStr)).padStart(2, '0')}`;
}

function weekRange(dateStr) {
  const MONTHS = ['jan', 'fév', 'mar', 'avr', 'mai', 'jun', 'jul', 'aoû', 'sep', 'oct', 'nov', 'déc'];
  const mon = new Date(dateStr + 'T00:00:00');
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const endLabel = `${sun.getDate()} ${MONTHS[sun.getMonth()]} ${sun.getFullYear()}`;
  if (mon.getMonth() === sun.getMonth()) {
    return `${mon.getDate()} au ${endLabel}`;
  }
  return `${mon.getDate()} ${MONTHS[mon.getMonth()]} au ${endLabel}`;
}

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="skeleton h-4 w-72 mb-2" />
      <div className="skeleton h-3 w-48 mb-4" />
      <div className="skeleton h-64 w-full rounded-chart" />
    </div>
  );
}

// ─── Custom Tooltip ─────────────────────────────────────

function CvrAovTooltip({ active, payload, label, cvrAvg, aovAvg }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const cvrDiff = row.cvr - cvrAvg;
  const aovDiff = row.aov - aovAvg;
  return (
    <div className="bg-white border border-border-strong rounded-chart p-3 shadow-card text-xs min-w-[220px]">
      <p className="text-navy-muted mb-2 font-medium">
        {weekLabel(row.date)} — {weekRange(row.date)}
      </p>
      <p className="text-navy font-semibold mb-1">
        CVR : {row.cvr.toFixed(2)}%{' '}
        <span className={cvrDiff >= 0 ? 'text-success' : 'text-danger'}>
          {cvrDiff >= 0 ? '▲' : '▼'} {cvrDiff >= 0 ? '+' : ''}{cvrDiff.toFixed(2)}pt
        </span>
      </p>
      <p className="text-navy font-semibold mb-1">
        Panier moyen : {fAov(row.aov)}{' '}
        <span className={aovDiff >= 0 ? 'text-success' : 'text-danger'}>
          {aovDiff >= 0 ? '▲' : '▼'} {aovDiff >= 0 ? '+' : ''}{aovDiff.toFixed(2)}€
        </span>
      </p>
      <p className="text-navy-muted">Sessions : {row.sessions.toLocaleString('fr-FR')}</p>
    </div>
  );
}

// ─── CvrAovYtdChart ─────────────────────────────────────

export default function CvrAovYtdChart({ filters }) {
  const [source, setSource] = useState('seo');
  const [granularity, setGranularity] = useState('week');

  const { data: result, isLoading } = useGA4CvrAovYtd({
    brand: filters.brand,
    market: filters.market,
    source,
    granularity,
  });

  if (isLoading || !result) return <Skeleton />;

  const { data, cvr, aov } = result;

  // Format labels
  function getLabel(dateStr) {
    if (granularity === 'day') {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { month: 'short', day: 'numeric' });
    }
    return weekLabel(dateStr);
  }

  const chartData = data.map(d => ({ ...d, label: getLabel(d.date) }));

  const cvrTrendDown = cvr.trend === 'DOWN';
  const aovTrendDown = aov.trend === 'DOWN';
  const cvrAvgStr = cvr.avg.toFixed(2);
  const aovAvgStr = fAov(aov.avg);

  // Y-axis domains
  const cvrValues = chartData.map(d => d.cvr).filter(v => v > 0);
  const cvrMin = cvrValues.length ? Math.max(0, Math.min(...cvrValues) * 0.92) : 0;
  const cvrMax = cvrValues.length ? Math.max(...cvrValues) * 1.08 : 20;

  const aovValues = chartData.map(d => d.aov).filter(v => v > 0);
  const aovMin = aovValues.length ? Math.max(0, Math.min(...aovValues) * 0.92) : 0;
  const aovMax = aovValues.length ? Math.max(...aovValues) * 1.08 : 200;

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      {/* Header row */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-navy">
              CVR & Panier moyen — depuis le 1er janvier
            </h3>
            <span className="text-[9px] font-semibold text-navy-muted bg-bg-page px-1.5 py-0.5 rounded">GA4</span>
          </div>
          <div className="flex items-center gap-6 mt-2">
            {/* CVR stat */}
            <div>
              <p className="text-sm text-navy-muted mb-1">
                CVR YTD :{' '}
                <span className="font-semibold text-navy">{cvrAvgStr}%</span>
                {'  '}
                <span className={cvrTrendDown ? 'text-success' : 'text-danger'}>
                  {cvrTrendDown ? '▲' : '▼'}{' '}
                  {cvr.delta_pct >= 0 ? '+' : ''}{cvr.delta_pct.toFixed(1)}% vs 14j précédents
                </span>
              </p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${cvrTrendDown ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {cvrTrendDown ? '▲ En hausse' : '▼ En baisse'}
              </span>
            </div>
            {/* AOV stat */}
            <div>
              <p className="text-sm text-navy-muted mb-1">
                Panier moyen YTD :{' '}
                <span className="font-semibold text-navy">{aovAvgStr}</span>
                {'  '}
                <span className={aovTrendDown ? 'text-success' : 'text-danger'}>
                  {aovTrendDown ? '▲' : '▼'}{' '}
                  {aov.delta_pct >= 0 ? '+' : ''}{aov.delta_pct.toFixed(1)}% vs 14j précédents
                </span>
              </p>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-block ${aovTrendDown ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}>
                {aovTrendDown ? '▲ En hausse' : '▼ En baisse'}
              </span>
            </div>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-2 shrink-0">
          {/* Source toggle */}
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {[
              { key: 'seo', label: 'SEA (google/cpc)' },
              { key: 'all', label: 'Toutes sources' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setSource(opt.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  source === opt.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Granularity toggle */}
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {[
              { key: 'day', label: 'Jour' },
              { key: 'week', label: 'Semaine' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setGranularity(opt.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  granularity === opt.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 46, 74, 0.08)" />

          <XAxis
            dataKey="label"
            tick={{ fill: '#8896B0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#8896B0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => v.toFixed(1) + '%'}
            domain={[cvrMin, cvrMax]}
          />
          <YAxis
            yAxisId="right"
            orientation="right"
            tick={{ fill: '#8896B0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={v => `${Math.round(v)}€`}
            domain={[aovMin, aovMax]}
          />

          <Tooltip content={({ active, payload, label }) => <CvrAovTooltip active={active} payload={payload} label={label} cvrAvg={cvr.avg} aovAvg={aov.avg} />} />

          <ReferenceLine
            yAxisId="left"
            y={cvr.avg}
            stroke="#1A2E4A"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: `Moy. ${cvrAvgStr}%`,
              fill: '#1A2E4A',
              fontSize: 10,
              position: 'insideTopLeft',
            }}
          />
          <ReferenceLine
            yAxisId="right"
            y={aov.avg}
            stroke="#00E89A"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: `Moy. ${aovAvgStr}`,
              fill: '#00B87A',
              fontSize: 10,
              position: 'insideTopRight',
            }}
          />

          <Line
            yAxisId="left"
            type="monotone"
            dataKey="cvr"
            name="CVR"
            stroke="#1A2E4A"
            strokeWidth={2}
            dot={false}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="aov"
            name="Panier moyen"
            stroke="#00E89A"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
