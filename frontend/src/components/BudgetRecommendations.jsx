import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { MarketLabel } from '../utils/flags.jsx';
import { API_URL } from '../utils/api';

async function fetchRecommendations(brand, month, granularity) {
  const url = new URL('/api/budget/recommendations', API_URL || window.location.origin);
  url.searchParams.set('brand', brand);
  url.searchParams.set('month', month);
  url.searchParams.set('granularity', granularity);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Recommendations API error');
  return res.json();
}

const TYPE_CONFIG = {
  AUGMENTER:   { label: 'Augmenter',   dot: '#00B87A', bg: '#E8FDF5', color: '#00B87A', icon: '↑' },
  REDUIRE:     { label: 'Réduire',     dot: '#E8524A', bg: '#FEF2F2', color: '#E8524A', icon: '↓' },
  OPPORTUNITE: { label: 'Opportunité', dot: '#F5A623', bg: '#FFF8ED', color: '#F5A623', icon: '◈' },
  STABLE:      { label: 'Stable',      dot: '#8896B0', bg: '#F4F6F9', color: '#8896B0', icon: '—' },
};

function TypeBadge({ type }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.STABLE;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
      style={{ background: cfg.bg, color: cfg.color }}
    >
      <span>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
}

function PacingCell({ pct }) {
  if (pct == null) return <span className="text-navy-muted">—</span>;
  const color = pct > 110 ? '#E8524A' : pct < 85 ? '#F5A623' : '#00B87A';
  return <span style={{ color }} className="font-semibold">{pct.toFixed(1)}%</span>;
}

function ClickShareCell({ value }) {
  if (value == null) return <span className="text-[11px] text-navy-muted">N/A</span>;
  const pct = Math.round(value * 100);
  const color = pct < 65 ? '#F5A623' : '#8896B0';
  return <span style={{ color }}>{pct}%</span>;
}

const SORT_COLS = ['pacing_pct', 'roas_recent', 'roas_historical', 'click_share', 'impactScore'];

export default function BudgetRecommendations({ brand, month }) {
  const [granularity, setGranularity] = useState('market');
  const [sortCol, setSortCol] = useState('impactScore');
  const [sortDir, setSortDir] = useState('desc');

  const { data = [], isLoading, isError } = useQuery({
    queryKey: ['budget-recommendations', brand, month, granularity],
    queryFn: () => fetchRecommendations(brand, month, granularity),
    staleTime: 15 * 60 * 1000,
  });

  function toggleSort(col) {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  const sorted = [...data].sort((a, b) => {
    const av = a[sortCol] ?? 0;
    const bv = b[sortCol] ?? 0;
    return sortDir === 'asc' ? av - bv : bv - av;
  });

  function SortTh({ col, children }) {
    const active = sortCol === col;
    return (
      <th
        className="px-4 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer select-none hover:text-navy"
        onClick={() => toggleSort(col)}
      >
        <span className="flex items-center gap-1">
          {children}
          {active && <span className="text-[10px]">{sortDir === 'asc' ? '▲' : '▼'}</span>}
        </span>
      </th>
    );
  }

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 pb-3 flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-navy">Recommandations automatiques</h3>
          <p className="text-[12px] text-navy-muted mt-0.5">Basées sur les 14 derniers jours de performance</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {['market', 'campaign'].map(g => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`px-3 py-1.5 rounded text-[12px] font-medium transition-colors ${
                granularity === g
                  ? 'bg-navy text-white'
                  : 'bg-bg-page text-navy hover:bg-navy/10'
              }`}
            >
              {g === 'market' ? 'Marché' : 'Campagne'}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        {isLoading ? (
          <div className="px-6 py-8 text-center text-navy-muted text-[13px]">Chargement des recommandations…</div>
        ) : isError ? (
          <div className="px-6 py-8 text-center text-danger text-[13px]">Erreur lors du chargement.</div>
        ) : sorted.length === 0 ? (
          <div className="px-6 py-8 text-center text-navy-muted text-[13px]">Aucune donnée disponible.</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-bg-page border-b-2 border-border">
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                  {granularity === 'campaign' ? 'Campagne' : 'Marché'}
                </th>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Recommandation</th>
                <SortTh col="pacing_pct">Pacing</SortTh>
                <SortTh col="roas_recent">ROAS 14j</SortTh>
                <SortTh col="roas_historical">ROAS 60j</SortTh>
                <SortTh col="click_share">Part clics</SortTh>
                <th className="px-4 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Actions suggérées</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item, i) => (
                <tr key={item.campaignId || item.market} className={`border-b border-border ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                  <td className="px-4 py-3 font-medium text-navy">
                    {granularity === 'campaign' ? (
                      <div>
                        <div className="text-[12px] font-medium">{item.campaign}</div>
                        <div className="text-[11px] text-navy-muted">
                          <MarketLabel market={item.market} /> · {item.campaignType}
                        </div>
                      </div>
                    ) : (
                      <MarketLabel market={item.market} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <TypeBadge type={item.type} />
                    <div className="text-[11px] text-navy-muted mt-1 max-w-[220px] leading-tight">{item.label}</div>
                  </td>
                  <td className="px-4 py-3 text-right"><PacingCell pct={item.pacing_pct} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-navy">
                    {item.roas_recent > 0 ? `${item.roas_recent}×` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-navy-muted">
                    {item.roas_historical > 0 ? `${item.roas_historical}×` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right"><ClickShareCell value={item.click_share} /></td>
                  <td className="px-4 py-3">
                    <ul className="list-none space-y-0.5">
                      {(item.actions || []).map((a, ai) => (
                        <li key={ai} className="text-[11px] text-navy flex items-start gap-1">
                          <span className="text-navy-muted mt-0.5">›</span>
                          <span>{a}</span>
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Disclaimer */}
      <div className="px-6 py-4 border-t border-border">
        <p className="text-[11px] text-navy-muted leading-relaxed">
          Ces recommandations sont générées automatiquement sur la base des données disponibles.<br />
          Elles ne remplacent pas l&apos;analyse humaine — valider avant toute action en compte.
        </p>
      </div>
    </div>
  );
}
