import { useState, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  LineChart, Line, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { useBrandOverview, useBrandTrend } from '../hooks/useAdsData';
import { fEur, fNum, fCompact, fROAS, fEurInt, fEurCompact } from '../utils/formatters';
import { API_URL, fetchApi } from '../utils/api';

const BRANDS = [
  { key: 'Cocooncenter', label: 'Cocooncenter' },
  { key: 'Pascal Coste Shopping', label: 'Pascal Coste' },
  { key: 'Parapharmacie Lafayette', label: 'Para. Lafayette' },
];

const PRESETS = [
  { key: '14d', label: '14j', days: 14 },
  { key: '30d', label: '30j', days: 30 },
  { key: '90d', label: '90j', days: 90 },
  { key: 'ytd', label: 'YTD', days: null },
];

const GRANULARITIES = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

const COLORS = {
  navy: '#1A2E4A',
  mint: '#00E89A',
  green: '#00B87A',
  orange: '#F5A623',
  muted: '#8896B0',
};

function fmtDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPresetDates(key) {
  const today = new Date();
  // GSC lag: default end = today - 3d
  const to = new Date(today);
  to.setDate(to.getDate() - 3);
  if (key === 'ytd') {
    return { from: `${to.getFullYear()}-01-01`, to: fmtDate(to) };
  }
  const preset = PRESETS.find(p => p.key === key);
  const from = new Date(to);
  from.setDate(from.getDate() - (preset.days - 1));
  return { from: fmtDate(from), to: fmtDate(to) };
}

function isRecentDate(dateStr, daysBack = 3) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysBack);
  return d >= cutoff;
}

function fDeltaPct(v) {
  if (v == null || isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(1) + '%';
}
function fDeltaPts(v) {
  if (v == null || isNaN(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(1) + 'pt';
}
function deltaClass(v) {
  if (v == null || isNaN(v) || v === 0) return 'text-navy-muted';
  return v > 0 ? 'text-success' : 'text-danger';
}

function Scorecard({ label, value, delta, deltaFormat = 'pct', sub }) {
  return (
    <div className="bg-white rounded-card p-4 border border-border shadow-card">
      <div className="text-[10px] uppercase tracking-wider text-navy-muted font-semibold">{label}</div>
      <div className="text-2xl font-bold text-navy mt-1">{value}</div>
      {delta != null && (
        <div className={`text-xs mt-1 font-medium ${deltaClass(delta)}`}>
          {deltaFormat === 'pts' ? fDeltaPts(delta) : fDeltaPct(delta)}
        </div>
      )}
      {sub && <div className="text-[11px] text-navy-muted mt-0.5">{sub}</div>}
    </div>
  );
}

function Section({ title, subtitle, children, controls }) {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {subtitle && <p className="text-[11px] text-navy-muted mt-0.5">{subtitle}</p>}
        </div>
        {controls}
      </div>
      {children}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-card p-4 border border-border shadow-card">
            <div className="skeleton h-16 w-full" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-card p-6 border border-border shadow-card"><div className="skeleton h-64 w-full" /></div>
      <div className="bg-white rounded-card p-6 border border-border shadow-card"><div className="skeleton h-64 w-full" /></div>
    </div>
  );
}

export default function BrandView() {
  const [brand, setBrand] = useState('Cocooncenter');
  const [presetKey, setPresetKey] = useState('30d');
  const [granularity, setGranularity] = useState('day');
  const [excludedIds, setExcludedIds] = useState(new Set());
  const [savingConfig, setSavingConfig] = useState(false);
  const queryClient = useQueryClient();

  const { from, to } = useMemo(() => getPresetDates(presetKey), [presetKey]);

  // Load existing overrides when brand changes
  useEffect(() => {
    let cancelled = false;
    fetchApi('/api/brand/campaigns-config', { brand })
      .then(res => {
        if (cancelled) return;
        setExcludedIds(new Set((res.excluded_campaign_ids || []).map(String)));
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, [brand]);

  const overview = useBrandOverview({ brand, from, to });
  const trend = useBrandTrend({ brand, from, to, granularity });

  const showGscLagBanner = isRecentDate(to, 3);

  async function toggleCampaign(campaignId) {
    const next = new Set(excludedIds);
    const id = String(campaignId);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExcludedIds(next);
    setSavingConfig(true);
    try {
      await fetch(`${API_URL}/api/brand/campaigns-config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, excluded_campaign_ids: Array.from(next) }),
      });
      await queryClient.invalidateQueries({ queryKey: ['brandOverview'] });
      await queryClient.invalidateQueries({ queryKey: ['brandTrend'] });
    } finally {
      setSavingConfig(false);
    }
  }

  if (overview.isLoading && !overview.data) return (
    <div className="space-y-4">
      <Controls brand={brand} setBrand={setBrand} presetKey={presetKey} setPresetKey={setPresetKey} />
      <Skeleton />
    </div>
  );

  if (overview.isError) {
    const msg = overview.error?.message || 'Erreur chargement';
    const needsAuth = /not authenticated/i.test(msg);
    return (
      <div className="space-y-4">
        <Controls brand={brand} setBrand={setBrand} presetKey={presetKey} setPresetKey={setPresetKey} />
        <div className="bg-danger-bg border border-danger/20 rounded-card px-4 py-3 text-xs text-danger font-medium">
          {needsAuth
            ? 'Non authentifié. Connectez votre compte Google avec le scope Search Console (webmasters.readonly).'
            : `Erreur: ${msg}`}
        </div>
      </div>
    );
  }

  const d = overview.data;
  const trendData = trend.data || [];

  const breakdown = d.breakdown || {};
  const donutData = [
    { name: 'Brand exact', value: breakdown.brand_exact_impressions || 0, color: COLORS.navy },
    { name: 'Variants', value: breakdown.brand_variant_impressions || 0, color: COLORS.mint },
    { name: 'Brand + mot-clé', value: breakdown.brand_plus_kw_impressions || 0, color: COLORS.orange },
  ];

  const stackData = trendData.map(t => {
    const total = t.gsc_impressions + t.gads_impressions;
    return {
      date: t.date,
      seo_pct: total > 0 ? (t.gsc_impressions / total) * 100 : 0,
      sea_pct: total > 0 ? (t.gads_impressions / total) * 100 : 0,
    };
  });

  return (
    <div className="space-y-4">
      <Controls
        brand={brand} setBrand={setBrand}
        presetKey={presetKey} setPresetKey={setPresetKey}
      />

      {showGscLagBanner && (
        <div className="bg-warning-bg border border-warning/30 rounded-card px-4 py-2 text-xs text-warning font-medium flex items-center gap-2">
          <span>⚠</span>
          <span>Les données GSC des 3 derniers jours peuvent être incomplètes (latence ~48-72h).</span>
        </div>
      )}

      {/* Section 1 — Scorecards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Scorecard
          label="Demande totale (impressions)"
          value={fCompact(d.brand_demand.total_impressions)}
          delta={d.brand_demand.delta_total_impressions}
        />
        <Scorecard
          label="Part SEA (SoV)"
          value={`${(d.brand_demand.sea_coverage_pct || 0).toFixed(1)}%`}
          delta={d.brand_demand.delta_sea_coverage_pct}
          deltaFormat="pts"
        />
        <Scorecard
          label="Cannibalisation estimée"
          value={fNum(d.cannibalization.estimated_cannibalized_clicks)}
          sub={`${d.cannibalization.cannibalization_rate_pct}% des clics SEA`}
        />
        <Scorecard
          label="Incrément SEA (clics)"
          value={fNum(d.cannibalization.sea_increment_clicks)}
          sub={`${fEurInt(d.cannibalization.sea_increment_revenue)} estimés`}
        />
      </div>

      {/* Section 2 — Évolution demande brand */}
      <Section
        title="Évolution de la demande brand"
        subtitle="Impressions SEO (GSC) vs SEA (Google Ads)"
        controls={
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {GRANULARITIES.map(g => (
              <button key={g.key} onClick={() => setGranularity(g.key)}
                className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${granularity === g.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                {g.label}
              </button>
            ))}
          </div>
        }
      >
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="date" stroke="#8896B0" fontSize={11} />
            <YAxis stroke="#8896B0" fontSize={11} tickFormatter={fCompact} />
            <Tooltip formatter={(v) => fNum(v)} labelStyle={{ color: '#1A2E4A' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="gsc_impressions" name="SEO (GSC)" stroke={COLORS.navy} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="gads_impressions" name="SEA (Ads)" stroke={COLORS.mint} strokeWidth={2} dot={false} />
            <Line type="monotone" dataKey="total_impressions" name="Total" stroke={COLORS.orange} strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Section>

      {/* Section 3 — Part couverte par SEA */}
      <Section title="Part couverte par le SEA" subtitle="% des impressions brand servies par Google Ads">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={stackData} stackOffset="expand">
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="date" stroke="#8896B0" fontSize={11} />
            <YAxis stroke="#8896B0" fontSize={11} tickFormatter={(v) => `${Math.round(v * 100)}%`} />
            <Tooltip formatter={(v) => `${v.toFixed(1)}%`} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Area type="monotone" dataKey="seo_pct" stackId="1" name="SEO" stroke={COLORS.green} fill={COLORS.green} fillOpacity={0.6} />
            <Area type="monotone" dataKey="sea_pct" stackId="1" name="SEA" stroke={COLORS.mint} fill={COLORS.mint} fillOpacity={0.6} />
          </AreaChart>
        </ResponsiveContainer>
      </Section>

      {/* Section 4 — Cannibalisation */}
      <Section title="Analyse de cannibalisation" subtitle="Estimation heuristique basée sur la position SEO moyenne">
        <table className="w-full text-sm">
          <tbody>
            {[
              ['Clics SEA brand', fNum(d.brand_demand.gads_clicks)],
              ['Position SEO moyenne', (d.cannibalization.seo_avg_position || 0).toFixed(2)],
              ['% cannibalisation estimé', `${d.cannibalization.cannibalization_rate_pct}%`],
              ['Clics cannibalisés (estim.)', fNum(d.cannibalization.estimated_cannibalized_clicks)],
              ['Clics incrémentaux (estim.)', fNum(d.cannibalization.sea_increment_clicks)],
              ['Coût SEA brand', fEurInt(d.cannibalization.sea_cost)],
              ['Revenue SEA brand', fEurInt(d.cannibalization.sea_revenue)],
              ['Incremental ROAS', fROAS(d.cannibalization.incremental_roas)],
            ].map(([label, val]) => (
              <tr key={label} className="border-b border-border last:border-0">
                <td className="py-2 text-navy-muted">{label}</td>
                <td className="py-2 text-right font-semibold text-navy">{val}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="mt-4 bg-warning-bg border border-warning/20 rounded-inner px-3 py-2 text-[11px] text-warning">
          ⚠️ L'estimation de cannibalisation est basée sur une heuristique (position SEO moyenne).
          Pour une mesure précise, envisager un test d'arrêt contrôlé des campagnes brand sur une période limitée.
        </div>
      </Section>

      {/* Section 5 — Donut breakdown */}
      <Section title="Répartition par type de requête brand" subtitle="Impressions GSC par catégorie de query">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                {donutData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
              </Pie>
              <Tooltip formatter={(v) => fNum(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2">
            {donutData.map(item => {
              const total = donutData.reduce((s, x) => s + x.value, 0);
              const pct = total > 0 ? (item.value / total) * 100 : 0;
              return (
                <div key={item.name} className="flex items-center gap-3">
                  <span className="w-3 h-3 rounded-sm" style={{ background: item.color }} />
                  <span className="text-xs text-navy-muted flex-1">{item.name}</span>
                  <span className="text-xs font-semibold text-navy">{fNum(item.value)}</span>
                  <span className="text-[11px] text-navy-muted w-12 text-right">{pct.toFixed(1)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </Section>

      {/* Section 6 — Campagnes détectées */}
      <Section
        title="Campagnes brand détectées"
        subtitle='Détection auto par nom de campagne (regex "brand" / "marque" / " M ").'
        controls={savingConfig && <span className="text-[11px] text-navy-muted">Enregistrement...</span>}
      >
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-navy-muted">
              <th className="py-2 text-left font-medium">Inclure</th>
              <th className="py-2 text-left font-medium">Campagne</th>
              <th className="py-2 text-right font-medium">Clics</th>
              <th className="py-2 text-right font-medium">Coût</th>
              <th className="py-2 text-right font-medium">Revenue</th>
            </tr>
          </thead>
          <tbody>
            {(d.gads_brand_campaigns || []).map(c => {
              const isExcluded = excludedIds.has(String(c.campaign_id));
              return (
                <tr key={c.campaign_id || c.campaign_name} className={`border-b border-border last:border-0 ${isExcluded ? 'opacity-50' : ''}`}>
                  <td className="py-2">
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={() => toggleCampaign(c.campaign_id)}
                      className="accent-navy"
                    />
                  </td>
                  <td className="py-2 text-navy">{c.campaign_name}</td>
                  <td className="py-2 text-right text-navy">{fNum(c.clicks)}</td>
                  <td className="py-2 text-right text-navy">{fEurInt(c.cost)}</td>
                  <td className="py-2 text-right text-navy">{fEurInt(c.revenue)}</td>
                </tr>
              );
            })}
            {(d.gads_brand_campaigns || []).length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-navy-muted">Aucune campagne brand détectée sur la période.</td></tr>
            )}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-navy-muted">
          Décoche les faux positifs pour les exclure du calcul d'incrément et de cannibalisation.
        </p>
      </Section>
    </div>
  );
}

function Controls({ brand, setBrand, presetKey, setPresetKey }) {
  return (
    <div className="bg-white rounded-card p-3 border border-border shadow-card flex items-center justify-between gap-4 flex-wrap">
      <div className="flex gap-1">
        {BRANDS.map(b => (
          <button key={b.key} onClick={() => setBrand(b.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-inner transition-colors ${brand === b.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy hover:bg-bg-page'}`}>
            {b.label}
          </button>
        ))}
      </div>
      <div className="flex bg-bg-page rounded-inner p-0.5">
        {PRESETS.map(p => (
          <button key={p.key} onClick={() => setPresetKey(p.key)}
            className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${presetKey === p.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
