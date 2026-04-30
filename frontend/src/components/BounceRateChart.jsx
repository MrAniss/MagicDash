import { useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { useGA4BounceRateYtd } from '../hooks/useAdsData';

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
  const MONTHS = [
    'jan',
    'fév',
    'mar',
    'avr',
    'mai',
    'jun',
    'jul',
    'aoû',
    'sep',
    'oct',
    'nov',
    'déc',
  ];
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

function BounceTooltip({ active, payload, avg }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const br = row.bounce_rate * 100;
  const diffPt = ((row.bounce_rate - avg) * 100).toFixed(1);
  const isGood = row.bounce_rate <= avg;
  return (
    <div className="bg-white border border-border-strong rounded-chart p-3 shadow-card text-xs min-w-[200px]">
      <p className="text-navy-muted mb-2 font-medium">
        {weekLabel(row.date)} — {weekRange(row.date)}
      </p>
      <p className="text-navy font-semibold mb-1">
        Taux de rebond : {br.toFixed(1)}%{' '}
        <span className={isGood ? 'text-success' : 'text-danger'}>
          {isGood ? '▼ Bien' : '▲ À améliorer'}
        </span>
      </p>
      <p className="text-navy-muted mb-1">Sessions : {row.sessions.toLocaleString('fr-FR')}</p>
      <p className={isGood ? 'text-success' : 'text-danger'}>
        vs moyenne YTD : {Number(diffPt) >= 0 ? '+' : ''}
        {diffPt}pt
      </p>
    </div>
  );
}

// ─── BounceRateChart ────────────────────────────────────

export default function BounceRateChart({ filters, sourceMedium }) {
  const [granularity, setGranularity] = useState('week');

  const { data: result, isLoading } = useGA4BounceRateYtd({
    brand: filters.brand,
    market: filters.market,
    sourceMedium,
    granularity,
  });

  if (isLoading || !result) return <Skeleton />;

  const { data, avg, trend, delta_pct } = result;

  // Y-axis domain and gradient cut-point
  const yValues = data.map((d) => d.bounce_rate).filter((v) => v > 0);
  const yMin = yValues.length ? Math.max(0, Math.min(...yValues) * 0.92) : 0;
  const yMax = yValues.length ? Math.max(...yValues) * 1.08 : 1;
  // avgOffset: % from top of chart where avg falls (SVG y=0 is top)
  const avgOffset =
    yMax > yMin ? Math.max(0, Math.min(100, ((yMax - avg) / (yMax - yMin)) * 100)) : 50;

  const avgPct = (avg * 100).toFixed(1);
  const trendDown = trend === 'DOWN';

  // Format labels based on granularity
  function getLabel(dateStr) {
    if (granularity === 'day') {
      return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', {
        month: 'short',
        day: 'numeric',
      });
    }
    return weekLabel(dateStr);
  }

  const chartData = data.map((d) => ({ ...d, label: getLabel(d.date) }));

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      {/* Header row */}
      <div className="flex items-start justify-between mb-1">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-navy">
              Taux de rebond — depuis le 1er janvier
            </h3>
            <span className="text-[9px] font-semibold text-navy-muted bg-bg-page px-1.5 py-0.5 rounded">
              GA4
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-navy-muted">
              Moyenne YTD : <span className="font-semibold text-navy">{avgPct}%</span>
              {'  '}
              <span className={trendDown ? 'text-success' : 'text-danger'}>
                {trendDown ? '▼' : '▲'} {delta_pct >= 0 ? '+' : ''}
                {delta_pct.toFixed(1)}% vs 14j précédents
              </span>
            </p>
            <span
              className={`text-xs font-semibold px-2 py-0.5 rounded-full ${trendDown ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
            >
              {trendDown ? '▼ En amélioration' : '▲ En dégradation'}
            </span>
          </div>
        </div>

        {/* Toggles */}
        <div className="flex gap-2 shrink-0">
          {/* Granularity toggle */}
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {[
              { key: 'day', label: 'Jour' },
              { key: 'week', label: 'Semaine' },
            ].map((opt) => (
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

      <p className="text-[10px] text-navy-muted mb-4">↓ Bas = meilleur taux de rebond</p>

      <ResponsiveContainer width="100%" height={300}>
        <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
          <defs>
            <linearGradient id="bounceAreaGradient" x1="0" y1="0" x2="0" y2="1">
              {/* Top portion (high bounce = bad) → red */}
              <stop offset={`${avgOffset}%`} stopColor="#E8524A" stopOpacity={0.22} />
              {/* Bottom portion (low bounce = good) → mint */}
              <stop offset={`${avgOffset}%`} stopColor="#00E89A" stopOpacity={0.22} />
            </linearGradient>
          </defs>

          <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 46, 74, 0.08)" />

          <XAxis
            dataKey="label"
            tick={{ fill: '#8896B0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: '#8896B0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v * 100).toFixed(0) + '%'}
            domain={[yMin, yMax]}
          />

          <Tooltip
            content={({ active, payload }) => (
              <BounceTooltip active={active} payload={payload} avg={avg} />
            )}
          />

          <ReferenceLine
            y={avg}
            stroke="#00E89A"
            strokeDasharray="4 4"
            strokeWidth={1.5}
            label={{
              value: `Moy. ${avgPct}%`,
              fill: '#00B87A',
              fontSize: 10,
              position: 'insideTopRight',
            }}
          />

          <Area
            type="monotone"
            dataKey="bounce_rate"
            stroke="#1A2E4A"
            strokeWidth={2}
            fill="url(#bounceAreaGradient)"
            dot={false}
            name="Taux de rebond"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
