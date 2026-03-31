import { useState, useMemo, useCallback } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, LineChart, Line, XAxis, YAxis, CartesianGrid } from 'recharts';
import { useGA4Kpis, useGA4Trend, useGA4Channels, useKpis } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fDelta, fAov } from '../utils/formatters';

// ─── KPI config for GA4 scorecards ─────────────────────
const GA4_KPI_CONFIG = [
  { key: 'sessions',  label: 'SESSIONS',        format: fNum, deltaKey: 'sessions_pct',  accent: '#378ADD' },
  { key: 'users',     label: 'UTILISATEURS',    format: fNum, deltaKey: 'users_pct',     accent: '#7F77DD' },
  { key: 'newCustomers', label: 'NOUVEAUX CLIENTS', format: fNum, deltaKey: 'newCustomers_pct', accent: '#A78BFA' },
  { key: 'revenue',   label: 'REVENUE',         format: fEur, deltaKey: 'revenue_pct',   accent: '#00E89A' },
  { key: 'transactions', label: 'TRANSACTIONS', format: fNum, deltaKey: 'transactions_pct', accent: '#F5A623' },
  { key: 'cvr',       label: 'CVR',             format: fPct, deltaKey: 'cvr_pct',       accent: '#1A2E4A' },
  { key: 'aov',       label: 'PANIER MOYEN',    format: fAov, deltaKey: 'aov_pct',       accent: '#00B87A' },
];

const CHANNEL_COLORS = {
  'Paid Search': '#1A2E4A',
  'Organic Search': '#00B87A',
  'Direct': '#378ADD',
  'Referral': '#F5A623',
  'Social': '#D4537E',
  'Email': '#7F77DD',
  'Display': '#9CA3AF',
  'Paid Social': '#E67E22',
  'Affiliates': '#00E89A',
};
const DEFAULT_COLOR = '#B0BEC5';

const GRAN_OPTIONS = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

function Skeleton({ h = 'h-64' }) {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="skeleton h-4 w-40 mb-4" />
      <div className={`skeleton ${h} w-full rounded-chart`} />
    </div>
  );
}

// ─── Section 1: GA4 KPI Scorecards ─────────────────────
function GA4KpiCards({ data, isLoading }) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-7 gap-4">
        {GA4_KPI_CONFIG.map(k => (
          <div key={k.key} className="bg-white rounded-card p-5 border border-border shadow-card">
            <div className="skeleton h-2.5 w-12 mb-3" />
            <div className="skeleton h-7 w-24 mb-2" />
            <div className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const { current, previous, deltas } = data;

  return (
    <div className="grid grid-cols-7 gap-4">
      {GA4_KPI_CONFIG.map(kpi => {
        const value = current[kpi.key];
        const prevValue = previous[kpi.key];
        const delta = deltas[kpi.deltaKey];
        const isPositive = delta > 0;
        const isNegative = delta < 0;
        const deltaColor = isPositive ? 'text-success' : isNegative ? 'text-danger' : 'text-navy-muted';
        const arrow = isPositive ? '▲' : isNegative ? '▼' : '';
        const deltaText = `${arrow} ${fDelta(delta, 'pct')}`;

        return (
          <div key={kpi.key} className="bg-white rounded-card border border-border shadow-card overflow-hidden">
            <div className="h-[3px]" style={{ background: kpi.accent }} />
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-navy-muted text-[11px] font-medium uppercase tracking-[0.06em]">{kpi.label}</p>
                <span className="text-[9px] font-semibold text-navy-muted bg-bg-page px-1.5 py-0.5 rounded">GA4</span>
              </div>
              <p className="text-[28px] font-bold text-navy leading-tight mb-2">{kpi.format(value)}</p>
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

// ─── Section 2: GA4 vs Google Ads Reconciliation ───────
function ReconciliationTable({ ga4Data, adsData, isLoading }) {
  if (isLoading || !ga4Data || !adsData) {
    return <Skeleton h="h-40" />;
  }

  const ga4 = ga4Data.current;
  const ads = adsData.current;

  const rows = [
    {
      label: 'Revenue',
      ga4: fEur(ga4.revenue),
      ads: fEur(ads.revenue),
      ga4Raw: ga4.revenue,
      adsRaw: ads.revenue,
    },
    {
      label: 'Conversions',
      ga4: fNum(ga4.transactions),
      ads: fNum(ads.conversions),
      ga4Raw: ga4.transactions,
      adsRaw: ads.conversions,
    },
    {
      label: 'CVR',
      ga4: fPct(ga4.cvr),
      ads: fPct(ads.cvr),
      ga4Raw: ga4.cvr,
      adsRaw: ads.cvr,
    },
    {
      label: 'Panier moyen',
      ga4: fAov(ga4.aov),
      ads: fAov(ads.aov),
      ga4Raw: ga4.aov,
      adsRaw: ads.aov,
    },
  ];

  function computeGap(ga4Val, adsVal) {
    if (adsVal === 0) return { text: '—', absPct: 0 };
    const pct = ((ga4Val - adsVal) / adsVal) * 100;
    return { text: `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`, absPct: Math.abs(pct) };
  }

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <h3 className="text-lg font-semibold text-navy mb-4">GA4 vs Google Ads — Reconciliation</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left text-navy-muted text-xs font-medium py-2 px-3">Metrique</th>
            <th className="text-right text-navy-muted text-xs font-medium py-2 px-3">
              <span className="bg-bg-page px-1.5 py-0.5 rounded text-[9px] font-semibold mr-1">GA4</span>
              GA4
            </th>
            <th className="text-right text-navy-muted text-xs font-medium py-2 px-3">
              <span className="bg-navy text-white px-1.5 py-0.5 rounded text-[9px] font-semibold mr-1">Ads</span>
              Google Ads
            </th>
            <th className="text-right text-navy-muted text-xs font-medium py-2 px-3">Ecart</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => {
            const gap = computeGap(row.ga4Raw, row.adsRaw);
            let gapColor = 'text-navy-muted';
            if (gap.absPct > 20) gapColor = 'text-danger';
            else if (gap.absPct > 10) gapColor = 'text-warning';

            return (
              <tr key={row.label} className="border-b border-border/50">
                <td className="py-3 px-3 font-medium text-navy">{row.label}</td>
                <td className="py-3 px-3 text-right text-navy">{row.ga4}</td>
                <td className="py-3 px-3 text-right text-navy">{row.ads}</td>
                <td className={`py-3 px-3 text-right font-medium ${gapColor}`}>{gap.text}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 3: Channel Breakdown ──────────────────────
function ChannelBreakdown({ data, isLoading }) {
  if (isLoading || !data) return <Skeleton />;

  const totalSessions = data.reduce((s, d) => s + d.sessions, 0);
  const totalRevenue = data.reduce((s, d) => s + d.revenue, 0);

  const chartData = data.map(d => ({
    ...d,
    sessionsPct: totalSessions > 0 ? Math.round((d.sessions / totalSessions) * 10000) / 100 : 0,
    revenuePct: totalRevenue > 0 ? Math.round((d.revenue / totalRevenue) * 10000) / 100 : 0,
    color: CHANNEL_COLORS[d.channel] || DEFAULT_COLOR,
  }));

  function PieTooltip({ active, payload }) {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="bg-white border border-border-strong rounded-chart p-3 shadow-card">
        <p className="text-xs font-medium text-navy mb-1">{d.channel}</p>
        <p className="text-xs text-navy-muted">Sessions: {fNum(d.sessions)} ({d.sessionsPct}%)</p>
        <p className="text-xs text-navy-muted">Revenue: {fEur(d.revenue)} ({d.revenuePct}%)</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <h3 className="text-lg font-semibold text-navy mb-4">Repartition par canal</h3>
      <div className="flex gap-8">
        {/* Donut */}
        <div className="w-64 h-64 flex-shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={chartData} dataKey="sessions" nameKey="channel" cx="50%" cy="50%"
                innerRadius={60} outerRadius={100} paddingAngle={2}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-navy-muted text-xs font-medium py-2">Canal</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">Sessions</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">%</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">Δ Sess.</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">Revenue</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">Δ Rev.</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">Conv.</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">Δ Conv.</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">CVR</th>
                <th className="text-right text-navy-muted text-xs font-medium py-2">Δ CVR</th>
              </tr>
            </thead>
            <tbody>
              {chartData.map(d => (
                <tr key={d.channel}
                  className={`border-b border-border/50 ${d.channel === 'Paid Search' ? 'bg-navy/5 font-medium' : ''}`}>
                  <td className="py-2 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: d.color }} />
                    <span className="text-navy text-xs">{d.channel}</span>
                  </td>
                  <td className="py-2 text-right text-navy text-xs">{fNum(d.sessions)}</td>
                  <td className="py-2 text-right text-navy-muted text-xs">{d.sessionsPct}%</td>
                  <td className={`py-2 text-right text-xs font-medium ${d.delta_sessions > 0 ? 'text-success' : d.delta_sessions < 0 ? 'text-danger' : 'text-navy-muted'}`}>{fDelta(d.delta_sessions, 'pct')}</td>
                  <td className="py-2 text-right text-navy text-xs">{fEur(d.revenue)}</td>
                  <td className={`py-2 text-right text-xs font-medium ${d.delta_revenue > 0 ? 'text-success' : d.delta_revenue < 0 ? 'text-danger' : 'text-navy-muted'}`}>{fDelta(d.delta_revenue, 'pct')}</td>
                  <td className="py-2 text-right text-navy text-xs">{fNum(d.transactions)}</td>
                  <td className={`py-2 text-right text-xs font-medium ${d.delta_transactions > 0 ? 'text-success' : d.delta_transactions < 0 ? 'text-danger' : 'text-navy-muted'}`}>{fDelta(d.delta_transactions, 'pct')}</td>
                  <td className="py-2 text-right text-navy text-xs">{fPct(d.cvr)}</td>
                  <td className={`py-2 text-right text-xs font-medium ${d.delta_cvr > 0 ? 'text-success' : d.delta_cvr < 0 ? 'text-danger' : 'text-navy-muted'}`}>{fDelta(d.delta_cvr, 'pct')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── Section 4: GA4 CVR & AOV Trend ────────────────────
function GA4CvrAovTrend({ filters }) {
  const [gran, setGran] = useState('week');

  const ytdFrom = useMemo(() => `${new Date().getFullYear()}-01-01`, []);
  const ytdTo = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const { data, isLoading } = useGA4Trend({
    brand: filters.brand,
    market: filters.market,
    from: ytdFrom,
    to: ytdTo,
    granularity: gran,
  });

  if (isLoading || !data) return <Skeleton />;

  const avgCvr = data.length > 0
    ? data.reduce((sum, d) => sum + (d.cvr || 0), 0) / data.length
    : 0;

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
          <span className="font-medium">Transactions:</span> {fNum(row?.transactions)}
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-navy">CVR & Panier moyen GA4 — depuis le 1er janvier</h3>
          <span className="text-[9px] font-semibold text-navy-muted bg-bg-page px-1.5 py-0.5 rounded">GA4</span>
        </div>
        <div className="flex bg-bg-page rounded-inner p-0.5">
          {GRAN_OPTIONS.map(g => (
            <button key={g.key} onClick={() => setGran(g.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${gran === g.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(26, 46, 74, 0.08)" />
          <XAxis dataKey="date" tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false} />
          <YAxis yAxisId="left" tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={v => v.toFixed(1) + '%'} domain={['auto', 'auto']} />
          <YAxis yAxisId="right" orientation="right" tick={{ fill: '#8896B0', fontSize: 11 }} tickLine={false} axisLine={false}
            tickFormatter={v => `${Math.round(v)} €`} domain={['auto', 'auto']} />
          <Tooltip content={<CustomTooltip />} />
          <Line yAxisId="left" type="monotone" dataKey="cvr" name="CVR" stroke="#1A2E4A" strokeWidth={2} dot={false} />
          <Line yAxisId="right" type="monotone" dataKey="aov" name="Panier moyen" stroke="#00E89A" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Main GA4View ──────────────────────────────────────
export default function GA4View({ filters }) {
  const [sourceMedium, setSourceMedium] = useState('google / cpc');

  const ga4Filters = { ...filters, sourceMedium: sourceMedium || undefined };
  const ga4Kpis        = useGA4Kpis(ga4Filters);
  const ga4KpisCpc     = useGA4Kpis({ ...filters, sourceMedium: 'google / cpc' }); // toujours google/cpc pour la réconciliation
  const ga4Channels    = useGA4Channels(ga4Filters);
  const adsKpis        = useKpis(filters);

  return (
    <div className="space-y-6">
      {/* Filtre source/medium */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-navy-muted font-medium">Source/Support :</span>
        <div className="flex bg-white border border-border rounded-inner p-0.5">
          {[{ key: 'google / cpc', label: 'Google CPC' }, { key: '', label: 'Tout le trafic' }].map(opt => (
            <button key={opt.key} onClick={() => setSourceMedium(opt.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${sourceMedium === opt.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 1: KPI Scorecards */}
      <GA4KpiCards data={ga4Kpis.data} isLoading={ga4Kpis.isLoading} />

      {/* Section 2: GA4 vs Google Ads — toujours google/cpc */}
      <ReconciliationTable
        ga4Data={ga4KpisCpc.data}
        adsData={adsKpis.data}
        isLoading={ga4KpisCpc.isLoading || adsKpis.isLoading}
      />

      {/* Section 3: Channel Breakdown */}
      <ChannelBreakdown data={ga4Channels.data} isLoading={ga4Channels.isLoading} />

      {/* Section 4: CVR & AOV Trend */}
      <GA4CvrAovTrend filters={ga4Filters} />
    </div>
  );
}
