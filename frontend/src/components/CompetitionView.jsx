import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts';
import { MarketLabel } from '../utils/flags.jsx';

// ─── Constants ──────────────────────────────────────────

const BRAND_OPTIONS = [
  { key: 'COCOONCENTER',           label: 'Cocooncenter' },
  { key: 'PASCAL_COSTE',           label: 'Pascal Coste' },
  { key: 'PARAPHARMACIE_LAFAYETTE',label: 'Para. Lafayette' },
];

const CC_MARKETS   = ['ALL','FR','UK','DE','ES','BE','IT','PL','US','AU','CA','SA'];
const SOLO_MARKETS = ['ALL','FR'];

function getMarketsForBrand(b) {
  return b === 'COCOONCENTER' ? CC_MARKETS : SOLO_MARKETS;
}

const WINDOWS = [
  { key: 14,  label: '14j' },
  { key: 30,  label: '30j' },
  { key: 60,  label: '60j' },
  { key: 90,  label: '90j' },
];

function subDays(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function todayStr() { return new Date().toISOString().slice(0, 10); }

function fPct(v, decimals = 0) {
  if (v == null) return 'N/A';
  return (v * 100).toFixed(decimals) + '%';
}
function fPp(v) {
  if (v == null) return '—';
  const sign = v > 0 ? '+' : '';
  return sign + v.toFixed(1) + 'pt';
}

// ─── API helpers ─────────────────────────────────────────

async function fetchCompetition(brand, market, from, to) {
  const url = new URL('/api/competition', window.location.origin);
  url.searchParams.set('brand', brand);
  url.searchParams.set('market', market);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Competition API error');
  return res.json();
}

async function fetchTrend(brand, market, from, to) {
  const url = new URL('/api/competition/trend', window.location.origin);
  url.searchParams.set('brand', brand);
  url.searchParams.set('market', market);
  url.searchParams.set('from', from);
  url.searchParams.set('to', to);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Trend API error');
  return res.json();
}

// ─── Sub-components ──────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = {
    'SAIN':   { bg: '#E8FDF5', color: '#00B87A', dot: '#00B87A' },
    'TENDU':  { bg: '#FFF8ED', color: '#F5A623', dot: '#F5A623' },
    'RISQUÉ': { bg: '#FEF2F2', color: '#E8524A', dot: '#E8524A' },
  }[status] || { bg: '#F4F6F9', color: '#8896B0', dot: '#8896B0' };
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />
      {status}
    </span>
  );
}

function DeltaBadge({ value, inverse = false }) {
  if (value == null) return <span className="text-navy-muted text-[11px]">—</span>;
  const isPositive = value > 0;
  const isGood = inverse ? !isPositive : isPositive;
  const color = isGood ? '#00B87A' : '#E8524A';
  const arrow = isPositive ? '▲' : '▼';
  return (
    <span className="text-[11px] font-medium ml-1" style={{ color }}>
      {arrow} {Math.abs(value).toFixed(1)}pt
    </span>
  );
}

function PMaxBadge() {
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-600 border border-amber-200 ml-1"
      title="Données partielles — inclut des campagnes PMax pour lesquelles Google ne remonte pas toutes les métriques de compétitivité.">
      ⚠ PMax
    </span>
  );
}

function PositionAboveColor({ value }) {
  if (value == null) return <span className="text-navy-muted">N/A</span>;
  const pct = value * 100;
  const color = pct < 20 ? '#00B87A' : pct < 40 ? '#F5A623' : '#E8524A';
  return <span style={{ color }} className="font-semibold">{pct.toFixed(0)}%</span>;
}

function Scorecard({ label, value, delta, inverse = false, accent }) {
  return (
    <div className="bg-white rounded-card border border-border shadow-card p-5">
      <div className="text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] mb-2">{label}</div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold" style={{ color: accent || '#1A2E4A' }}>
          {value}
        </span>
        <DeltaBadge value={delta} inverse={inverse} />
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-5 border border-border shadow-card">
      <div className="skeleton h-3 w-24 mb-3" />
      <div className="skeleton h-7 w-16" />
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-[12px]">
      <div className="font-semibold text-navy mb-1">{label}</div>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-navy-muted">{p.name}:</span>
          <span className="font-medium text-navy">{p.value != null ? p.value.toFixed(1) + '%' : 'N/A'}</span>
        </div>
      ))}
    </div>
  );
};

// ─── Main component ──────────────────────────────────────

export default function CompetitionView() {
  const [brand, setBrand]   = useState('COCOONCENTER');
  const [market, setMarket] = useState('ALL');
  const [window_, setWindow] = useState(30);

  const markets = getMarketsForBrand(brand);
  const from = subDays(window_);
  const to   = todayStr();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['competition', brand, market, window_],
    queryFn: () => fetchCompetition(brand, market, from, to),
    staleTime: 60 * 60 * 1000,
  });

  const { data: trendData = [], isLoading: trendLoading } = useQuery({
    queryKey: ['competition-trend', brand, market, window_],
    queryFn: () => fetchTrend(brand, market, from, to),
    staleTime: 60 * 60 * 1000,
  });

  // Aggregate ALL markets for scorecards when market=ALL
  const aggregate = useMemo(() => {
    if (!data?.markets?.length) return null;
    const rows = market === 'ALL' ? data.markets : data.markets.filter(m => m.market === market);
    if (!rows.length) return null;

    function wa(field) {
      const valid = rows.filter(r => r[field] != null && r.total_cost > 0);
      if (!valid.length) return null;
      const total = valid.reduce((s, r) => s + r.total_cost, 0);
      return valid.reduce((s, r) => s + r[field] * r.total_cost, 0) / total;
    }
    function avgDelta(field) {
      const valid = rows.filter(r => r.deltas?.[field] != null);
      if (!valid.length) return null;
      return valid.reduce((s, r) => s + r.deltas[field], 0) / valid.length;
    }

    return {
      impression_share: wa('impression_share'),
      click_share:      wa('click_share'),
      lost_budget:      wa('lost_budget'),
      lost_rank:        wa('lost_rank'),
      top_share:        wa('top_share'),
      abs_top_share:    wa('abs_top_share'),
      has_pmax:         rows.some(r => r.has_pmax),
      deltas: {
        impression_share: avgDelta('impression_share'),
        click_share:      avgDelta('click_share'),
        lost_budget:      avgDelta('lost_budget'),
        lost_rank:        avgDelta('lost_rank'),
      },
    };
  }, [data, market]);

  const displayMarkets = useMemo(() => {
    if (!data?.markets) return [];
    return market === 'ALL' ? data.markets : data.markets.filter(m => m.market === market);
  }, [data, market]);

  // Stacked area data: captured + lost_budget + lost_rank
  const areaData = useMemo(() => {
    return trendData
      .filter(d => d.impression_share != null)
      .map(d => ({
        date: d.date,
        Captée: d.impression_share,
        'Perdues budget': d.lost_budget,
        'Perdues classement': d.lost_rank,
      }));
  }, [trendData]);

  return (
    <div className="space-y-6">
      {/* ─── Header controls ─────────────────────── */}
      <div className="bg-white rounded-card border border-border shadow-card px-6 py-4 flex flex-wrap items-center gap-4">
        <div>
          <div className="text-[11px] text-navy-muted font-semibold uppercase tracking-wider mb-1.5">Marque</div>
          <div className="flex gap-1">
            {BRAND_OPTIONS.map(b => (
              <button key={b.key} onClick={() => { setBrand(b.key); setMarket('ALL'); }}
                className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${brand === b.key ? 'bg-navy text-white' : 'bg-bg-page text-navy hover:bg-navy/10'}`}>
                {b.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="text-[11px] text-navy-muted font-semibold uppercase tracking-wider mb-1.5">Marché</div>
          <div className="flex gap-1 flex-wrap">
            {markets.map(m => (
              <button key={m} onClick={() => setMarket(m)}
                className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${market === m ? 'bg-navy text-white' : 'bg-bg-page text-navy hover:bg-navy/10'}`}>
                {m === 'ALL' ? 'Tous' : m}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto">
          <div className="text-[11px] text-navy-muted font-semibold uppercase tracking-wider mb-1.5">Fenêtre</div>
          <div className="flex gap-1">
            {WINDOWS.map(w => (
              <button key={w.key} onClick={() => setWindow(w.key)}
                className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${window_ === w.key ? 'bg-navy text-white' : 'bg-bg-page text-navy hover:bg-navy/10'}`}>
                {w.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isError && (
        <div className="bg-danger-bg border border-danger/20 rounded-card px-4 py-3 text-[13px] text-danger">
          Erreur lors du chargement des données concurrence.
        </div>
      )}

      {/* ─── Section 1 — Scorecards ──────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {isLoading ? Array(6).fill(0).map((_, i) => <Skeleton key={i} />) : aggregate ? (
          <>
            <Scorecard
              label="Part d'impressions"
              value={aggregate.impression_share != null ? (aggregate.impression_share * 100).toFixed(1) + '%' : 'N/A'}
              delta={aggregate.deltas.impression_share}
              accent="#378ADD"
            />
            <Scorecard
              label={<>Part de clics {aggregate.has_pmax && <PMaxBadge />}</>}
              value={aggregate.click_share != null ? (aggregate.click_share * 100).toFixed(1) + '%' : 'N/A'}
              delta={aggregate.deltas.click_share}
              accent="#1A2E4A"
            />
            <Scorecard
              label={<>Perdues budget {aggregate.has_pmax && <PMaxBadge />}</>}
              value={aggregate.lost_budget != null ? (aggregate.lost_budget * 100).toFixed(1) + '%' : 'N/A'}
              delta={aggregate.deltas.lost_budget}
              inverse
              accent="#E8524A"
            />
            <Scorecard
              label="Perdues classement"
              value={aggregate.lost_rank != null ? (aggregate.lost_rank * 100).toFixed(1) + '%' : 'N/A'}
              delta={aggregate.deltas.lost_rank}
              inverse
              accent="#F5A623"
            />
            <Scorecard
              label="Haut de page"
              value={aggregate.top_share != null ? (aggregate.top_share * 100).toFixed(1) + '%' : 'N/A'}
              delta={null}
              accent="#00B87A"
            />
            <Scorecard
              label="Position #1"
              value={aggregate.abs_top_share != null ? (aggregate.abs_top_share * 100).toFixed(1) + '%' : 'N/A'}
              delta={null}
              accent="#7F77DD"
            />
          </>
        ) : null}
      </div>

      {/* ─── Section 2 — Tableau par marché ─────── */}
      {displayMarkets.length > 0 && (
        <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
          <div className="px-6 py-5 pb-3">
            <h3 className="text-lg font-semibold text-navy">Performance par marché</h3>
            {data?.markets?.some(m => m.has_pmax) && (
              <p className="text-[11px] text-amber-600 mt-1">
                ⚠ Les métriques PMax sont partielles — Google ne remonte pas toutes les données de compétitivité pour ce type de campagne.
              </p>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-bg-page border-b-2 border-border">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Marché</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Part impr.</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Part clics</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Perdues budget</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Perdues rank.</th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Haut page</th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Statut</th>
                </tr>
              </thead>
              <tbody>
                {displayMarkets.map((m, i) => (
                  <tr key={m.market} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                    <td className="px-4 py-3 font-medium text-navy group-hover:text-white">
                      <MarketLabel market={m.market} />
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {m.impression_share != null ? (m.impression_share * 100).toFixed(1) + '%' : 'N/A'}
                      <DeltaBadge value={m.deltas?.impression_share} />
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {m.click_share != null ? (m.click_share * 100).toFixed(1) + '%' : 'N/A'}
                      {m.has_pmax && <span className="text-[10px] text-amber-500 ml-1">⚠</span>}
                      <DeltaBadge value={m.deltas?.click_share} />
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {m.lost_budget != null ? (m.lost_budget * 100).toFixed(1) + '%' : 'N/A'}
                      {m.has_pmax && <span className="text-[10px] text-amber-500 ml-1">⚠</span>}
                      <DeltaBadge value={m.deltas?.lost_budget} inverse />
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {m.lost_rank != null ? (m.lost_rank * 100).toFixed(1) + '%' : 'N/A'}
                      <DeltaBadge value={m.deltas?.lost_rank} inverse />
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {m.top_share != null ? (m.top_share * 100).toFixed(1) + '%' : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-center"><StatusBadge status={m.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Section 3 — Charts ──────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Line chart — IS evolution */}
        <div className="bg-white rounded-card border border-border shadow-card p-6">
          <h3 className="text-base font-semibold text-navy mb-4">Évolution part d'impressions</h3>
          {trendLoading ? (
            <div className="skeleton h-48 w-full rounded-chart" />
          ) : trendData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-navy-muted text-[13px]">Aucune donnée</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={trendData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF2" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line dataKey="impression_share" name="Part impr." stroke="#1A2E4A" strokeWidth={2} dot={false} />
                <Line dataKey="top_share" name="Haut de page" stroke="#00B87A" strokeWidth={1.5} dot={false} />
                <Line dataKey="lost_budget" name="Perdues budget" stroke="#E8524A" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                <Line dataKey="lost_rank" name="Perdues rank." stroke="#F5A623" strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Stacked area — diagnostic */}
        <div className="bg-white rounded-card border border-border shadow-card p-6">
          <h3 className="text-base font-semibold text-navy mb-4">Diagnostic des pertes</h3>
          {trendLoading ? (
            <div className="skeleton h-48 w-full rounded-chart" />
          ) : areaData.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-navy-muted text-[13px]">Aucune donnée</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={areaData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF2" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={d => d.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => v + '%'} domain={[0, 100]} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area type="monotone" dataKey="Captée" stackId="1" stroke="#00B87A" fill="#E8FDF5" strokeWidth={1.5} />
                <Area type="monotone" dataKey="Perdues budget" stackId="1" stroke="#E8524A" fill="#FEF2F2" strokeWidth={1.5} />
                <Area type="monotone" dataKey="Perdues classement" stackId="1" stroke="#F5A623" fill="#FFF8ED" strokeWidth={1.5} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── Section 4 — Concurrents ─────────────── */}
      {displayMarkets.some(m => m.competitors?.length > 0) && (
        <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
          <div className="px-6 py-5 pb-3">
            <h3 className="text-lg font-semibold text-navy">Concurrents identifiés</h3>
            <p className="text-[12px] text-navy-muted mt-1">
              Données disponibles pour les campagnes Search et Shopping uniquement. Les campagnes PMax ne sont pas incluses dans cette analyse.
            </p>
          </div>

          {displayMarkets.filter(m => m.competitors?.length > 0).map(m => (
            <div key={m.market} className="border-t border-border">
              <div className="px-6 py-3 bg-bg-page flex items-center gap-2">
                <MarketLabel market={m.market} />
                <StatusBadge status={m.status} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Concurrent</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Part impr.</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Chevauchement</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Il passe au-dessus</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Tu passes au-dessus</th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Top page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.competitors.map((c, ci) => (
                      <tr key={c.domain} className={`border-b border-border ${ci % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                        <td className="px-4 py-2.5 font-medium text-navy">{c.domain}</td>
                        <td className="px-4 py-2.5 text-right text-navy">
                          {c.impression_share != null ? (c.impression_share * 100).toFixed(0) + '%' : 'N/A'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-navy">
                          {c.overlap_rate != null ? (c.overlap_rate * 100).toFixed(0) + '%' : 'N/A'}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <PositionAboveColor value={c.position_above} />
                        </td>
                        <td className="px-4 py-2.5 text-right text-navy">
                          {c.outranking_share != null ? (c.outranking_share * 100).toFixed(0) + '%' : 'N/A'}
                        </td>
                        <td className="px-4 py-2.5 text-right text-navy">
                          {c.top_share != null ? (c.top_share * 100).toFixed(0) + '%' : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Section 5 — Insights ────────────────── */}
      {data?.insights?.length > 0 && (
        <div className="bg-white rounded-card border border-border shadow-card p-6">
          <h3 className="text-lg font-semibold text-navy mb-1">
            💡 Insights — {window_} derniers jours
          </h3>
          <p className="text-[12px] text-navy-muted mb-5">Générés automatiquement depuis les données de compétitivité.</p>
          <div className="space-y-4">
            {data.insights.map((insight, i) => (
              <div key={i} className="flex gap-3">
                <div className="shrink-0 pt-0.5">
                  <MarketLabel market={insight.market} />
                </div>
                <div className="space-y-1">
                  {insight.messages.map((msg, mi) => (
                    <p key={mi} className="text-[13px] text-navy leading-relaxed">— {msg}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isLoading && !isError && (!data?.markets?.length) && (
        <div className="bg-white rounded-card border border-border shadow-card p-12 text-center text-navy-muted text-[13px]">
          Aucune donnée disponible pour la période sélectionnée.
        </div>
      )}
    </div>
  );
}
