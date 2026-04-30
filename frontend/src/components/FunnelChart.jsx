import { useState } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from 'recharts';
import { useGA4FunnelYtd } from '../hooks/useAdsData';

// ─── Constants ──────────────────────────────────────────

const FUNNEL_STEPS = [
  { key: 'add_to_cart', label: 'Panier', color: '#1A2E4A' },
  { key: 'begin_checkout', label: 'Début checkout', color: '#378ADD' },
  { key: 'add_shipping_info', label: 'Choix transporteur', color: '#00E89A' },
  { key: 'add_payment_info', label: 'Choix paiement', color: '#F5A623' },
  { key: 'purchase', label: 'Confirmation', color: '#00B87A' },
];

const RATE_STEPS = [
  { key: 'cart_to_checkout', label: 'Panier → Checkout', color: '#378ADD' },
  { key: 'checkout_to_shipping', label: 'Checkout → Transporteur', color: '#00E89A' },
  { key: 'shipping_to_payment', label: 'Transporteur → Paiement', color: '#F5A623' },
  { key: 'payment_to_purchase', label: 'Paiement → Confirmation', color: '#00B87A' },
];

// ─── Helpers ────────────────────────────────────────────

function mean(arr) {
  return arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function fKilo(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)}k`;
  return Math.round(v).toLocaleString('fr-FR');
}

function fNum(v) {
  return Math.round(v).toLocaleString('fr-FR');
}

function getXLabel(d, granularity) {
  if (granularity === 'week') {
    const match = d.period.match(/W(\d+)/);
    return match ? `S${match[1]}` : d.label;
  }
  return d.label;
}

// ─── Anomaly Detection ──────────────────────────────────

function detectInsights(data) {
  if (data.length < 4) return [];
  const insights = [];

  for (const rate of RATE_STEPS) {
    const vals = data.map((d) => d.completion_rates[rate.key]).filter((v) => v > 0);
    if (vals.length < 4) continue;
    const m = mean(vals);
    const sd = stdDev(vals);
    if (sd < 0.5) continue;

    for (const period of data) {
      const v = period.completion_rates[rate.key];
      if (v === 0) continue;
      if (Math.abs(v - m) > 2 * sd) {
        insights.push({
          type: 'anomaly',
          period: period.label,
          rate: rate.label,
          value: v,
          avg: m,
        });
      }
    }
  }

  for (const rate of RATE_STEPS) {
    const vals = data.map((d) => d.completion_rates[rate.key]).filter((v) => v > 0);
    if (vals.length < 8) continue;
    const recent = vals.slice(-4);
    const older = vals.slice(-8, -4);
    if (!recent.length || !older.length) continue;
    const recentMean = mean(recent);
    const olderMean = mean(older);
    if (olderMean > 0 && recentMean < olderMean * 0.9) {
      insights.push({ type: 'trend', rate: rate.label, recent: recentMean, older: olderMean });
    }
  }

  return insights;
}

// ─── Tooltips ───────────────────────────────────────────

function StepsTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const cart = d.add_to_cart || 0;
  const cartToPurchase = cart > 0 ? ((d.purchase / cart) * 100).toFixed(1) : '—';

  return (
    <div className="bg-white border border-border-strong rounded-chart p-3 shadow-card text-xs min-w-[240px]">
      <p className="text-navy-muted mb-2 font-medium">{d._label}</p>
      {FUNNEL_STEPS.map((step, i) => {
        const count = d[step.key] || 0;
        const prevCount = i === 0 ? null : d[FUNNEL_STEPS[i - 1].key] || 0;
        const pct = prevCount > 0 ? ((count / prevCount - 1) * 100).toFixed(0) : null;
        return (
          <div key={step.key} className="flex justify-between items-center mb-0.5">
            <span style={{ color: step.color }} className="font-medium">
              ● {step.label}
            </span>
            <span className="text-navy font-semibold">
              {fNum(count)}
              {pct !== null && (
                <span className={Number(pct) < 0 ? 'text-danger' : 'text-success'}>
                  {' '}
                  ({Number(pct) >= 0 ? '+' : ''}
                  {pct}%)
                </span>
              )}
            </span>
          </div>
        );
      })}
      <div className="mt-2 pt-2 border-t border-border text-navy-muted">
        Taux Panier → Confirmation :{' '}
        <span className="font-semibold text-navy">{cartToPurchase}%</span>
      </div>
    </div>
  );
}

function RatesTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  return (
    <div className="bg-white border border-border-strong rounded-chart p-3 shadow-card text-xs min-w-[220px]">
      <p className="text-navy-muted mb-2 font-medium">{d._label}</p>
      {RATE_STEPS.map((rate) => (
        <div key={rate.key} className="flex justify-between items-center mb-0.5">
          <span style={{ color: rate.color }} className="font-medium">
            {rate.label}
          </span>
          <span className="text-navy font-semibold">{(d[rate.key] || 0).toFixed(1)}%</span>
        </div>
      ))}
    </div>
  );
}

// ─── Skeleton ───────────────────────────────────────────

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card space-y-4">
      <div className="skeleton h-4 w-72 mb-2" />
      <div className="skeleton h-3 w-48 mb-4" />
      <div className="skeleton h-64 w-full rounded-chart" />
      <div className="skeleton h-48 w-full rounded-chart" />
    </div>
  );
}

// ─── Insights Block ─────────────────────────────────────

function InsightsBlock({ insights }) {
  return (
    <div className="bg-bg-page rounded-inner p-4 border border-border">
      <p className="text-sm font-semibold text-navy mb-3">💡 Insights tunnel</p>
      {insights.length === 0 ? (
        <p className="text-sm text-success">
          🟢 Tunnel globalement stable — aucune anomalie détectée.
        </p>
      ) : (
        <div className="space-y-3">
          {insights.map((insight, i) => {
            if (insight.type === 'anomaly') {
              return (
                <div key={i} className="text-sm">
                  <p className="text-danger font-medium">🔴 Anomalie détectée — {insight.period}</p>
                  <p className="text-navy-muted mt-0.5 ml-5">
                    Taux {insight.rate} à {insight.value.toFixed(1)}% (moyenne YTD :{' '}
                    {insight.avg.toFixed(1)}%)
                  </p>
                  <p className="text-navy-muted ml-5">
                    → Investiguer un problème tracking ou UX à cette période.
                  </p>
                </div>
              );
            }
            if (insight.type === 'trend') {
              return (
                <div key={i} className="text-sm">
                  <p className="font-medium" style={{ color: '#D97706' }}>
                    ⚠️ Décrochage {insight.rate} depuis 4 périodes
                  </p>
                  <p className="text-navy-muted mt-0.5 ml-5">
                    Baisse de {insight.older.toFixed(1)}% à {insight.recent.toFixed(1)}%
                  </p>
                  <p className="text-navy-muted ml-5">
                    → Vérifier : changement UX, erreur technique ou nouveau moyen de paiement ?
                  </p>
                </div>
              );
            }
            return null;
          })}
          <p className="text-sm text-success">
            🟢 Tunnel globalement stable sur les périodes sans anomalie.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── FunnelChart ────────────────────────────────────────

export default function FunnelChart({ filters }) {
  const [granularity, setGranularity] = useState('week');

  const { data, isLoading } = useGA4FunnelYtd({
    brand: filters.brand,
    market: filters.market,
    granularity,
  });

  if (isLoading) return <Skeleton />;
  if (!data?.length) {
    return (
      <div className="bg-white rounded-card p-6 border border-border shadow-card">
        <p className="text-navy-muted text-sm">
          Aucune donnée de tunnel disponible pour cette sélection.
        </p>
      </div>
    );
  }

  const stepsChartData = data.map((d) => ({
    _label: d.label,
    period: d.period,
    xLabel: getXLabel(d, granularity),
    ...Object.fromEntries(FUNNEL_STEPS.map((s) => [s.key, d.steps[s.key] || 0])),
  }));

  const ratesChartData = data.map((d) => ({
    _label: d.label,
    period: d.period,
    xLabel: getXLabel(d, granularity),
    ...Object.fromEntries(RATE_STEPS.map((r) => [r.key, d.completion_rates[r.key] || 0])),
  }));

  const ytdTotals = Object.fromEntries(
    FUNNEL_STEPS.map((s) => [s.key, data.reduce((sum, d) => sum + (d.steps[s.key] || 0), 0)])
  );

  const avgRates = Object.fromEntries(
    RATE_STEPS.map((r) => [
      r.key,
      mean(data.map((d) => d.completion_rates[r.key] || 0).filter((v) => v > 0)),
    ])
  );

  const avgCartToPurchase = mean(
    data.map((d) => d.completion_rates.cart_to_purchase || 0).filter((v) => v > 0)
  );

  const insights = detectInsights(data);

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-navy">
              Tunnel de conversion — depuis le 1er janvier
            </h3>
            <span className="text-[9px] font-semibold text-navy-muted bg-bg-page px-1.5 py-0.5 rounded">
              GA4
            </span>
          </div>
          <p className="text-sm text-navy-muted mt-1">
            5 étapes trackées · Taux d&apos;achèvement moyen :{' '}
            <span className="font-semibold text-navy">{avgCartToPurchase.toFixed(1)}%</span>
          </p>
        </div>
        <div className="flex bg-bg-page rounded-inner p-0.5 shrink-0">
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

      {/* YTD legend */}
      <div className="flex flex-wrap gap-4">
        {FUNNEL_STEPS.map((step) => (
          <div key={step.key} className="flex items-center gap-1.5">
            <span style={{ color: step.color }}>●</span>
            <span className="text-xs text-navy-muted">{step.label}</span>
            <span className="text-xs font-semibold text-navy">{fKilo(ytdTotals[step.key])}</span>
          </div>
        ))}
      </div>

      {/* Steps line chart */}
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={stepsChartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 46, 74, 0.08)" />
          <XAxis
            dataKey="xLabel"
            tick={{ fill: '#8896B0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fill: '#8896B0', fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)}
          />
          <Tooltip content={<StepsTooltip />} />
          {FUNNEL_STEPS.map((step) => (
            <Line
              key={step.key}
              type="monotone"
              dataKey={step.key}
              stroke={step.color}
              strokeWidth={2}
              dot={false}
              name={step.label}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>

      {/* Rates chart */}
      <div>
        <p className="text-sm font-medium text-navy mb-3">Taux de passage entre étapes</p>
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={ratesChartData} margin={{ top: 10, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 46, 74, 0.08)" />
            <XAxis
              dataKey="xLabel"
              tick={{ fill: '#8896B0', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fill: '#8896B0', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v.toFixed(0)}%`}
              domain={[0, 100]}
            />
            <Tooltip content={<RatesTooltip />} />
            {RATE_STEPS.map((rate) => (
              <Line
                key={rate.key}
                type="monotone"
                dataKey={rate.key}
                stroke={rate.color}
                strokeWidth={2}
                dot={false}
                name={rate.label}
              />
            ))}
            {RATE_STEPS.map((rate) => (
              <ReferenceLine
                key={`ref-${rate.key}`}
                y={avgRates[rate.key]}
                stroke={rate.color}
                strokeDasharray="4 4"
                strokeWidth={1}
                strokeOpacity={0.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap gap-4 mt-2">
          {RATE_STEPS.map((rate) => (
            <div key={rate.key} className="flex items-center gap-1.5">
              <span style={{ color: rate.color }}>●</span>
              <span className="text-xs text-navy-muted">{rate.label}</span>
              <span className="text-xs font-semibold text-navy">
                {(avgRates[rate.key] || 0).toFixed(1)}% moy.
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Insights */}
      <InsightsBlock insights={insights} />
    </div>
  );
}
