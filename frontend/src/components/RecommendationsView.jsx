import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';

const HIDDEN_KEY = 'dhygietal_hidden_recs';

function loadHidden() {
  try { return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || '[]')); }
  catch { return new Set(); }
}
function saveHidden(set) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...set]));
}

const TYPE_META = {
  BAISSER_TROAS:    { label: 'Baisser tROAS',     color: 'bg-[#E8F5E9] text-[#2E7D32]' },
  MONTER_TROAS:     { label: 'Monter tROAS',       color: 'bg-[#FFF3E0] text-[#E65100]' },
  AUGMENTER_BUDGET: { label: 'Augmenter budget',   color: 'bg-[#E3F2FD] text-[#1565C0]' },
  REDUIRE_BUDGET:   { label: 'Réduire budget',     color: 'bg-danger-bg text-danger' },
  DÉCROCHAGE:       { label: 'Décrochage',         color: 'bg-[#FCE4EC] text-[#C62828]' },
};

const PRIORITY_COLORS = {
  HIGH:   'bg-danger-bg text-danger border-danger/30',
  MEDIUM: 'bg-warning-bg text-warning border-warning/30',
};

function TypeBadge({ type }) {
  const meta = TYPE_META[type] || { label: type, color: 'bg-bg-page text-navy-muted' };
  return <span className={`text-[11px] font-medium px-2.5 py-1 rounded-[6px] ${meta.color}`}>{meta.label}</span>;
}

function PriorityBadge({ priority }) {
  const cls = PRIORITY_COLORS[priority] || 'bg-bg-page text-navy-muted border-border';
  return <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-[6px] border ${cls}`}>{priority}</span>;
}

function fEur(v) {
  if (v == null || isNaN(v)) return '—';
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v);
}

async function fetchRecs({ brand, market, type, priority }) {
  const url = new URL('/api/recommendations', window.location.origin);
  if (brand !== 'ALL') url.searchParams.set('brand', brand);
  if (market !== 'ALL') url.searchParams.set('market', market);
  if (type !== 'ALL') url.searchParams.set('type', type);
  if (priority !== 'ALL') url.searchParams.set('priority', priority);
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

const BRAND_OPTIONS = [
  { key: 'ALL', label: 'Toutes les marques' },
  { key: 'COCOONCENTER', label: 'Cocooncenter' },
  { key: 'PASCAL_COSTE', label: 'Pascal Coste' },
  { key: 'PARAPHARMACIE_LAFAYETTE', label: 'Para. Lafayette' },
];

const TYPE_OPTIONS = [
  { key: 'ALL', label: 'Tous les types' },
  { key: 'BAISSER_TROAS', label: 'Baisser tROAS' },
  { key: 'MONTER_TROAS', label: 'Monter tROAS' },
  { key: 'AUGMENTER_BUDGET', label: 'Augmenter budget' },
  { key: 'REDUIRE_BUDGET', label: 'Réduire budget' },
  { key: 'DÉCROCHAGE', label: 'Décrochage' },
];

const PRIORITY_OPTIONS = [
  { key: 'ALL', label: 'Toutes priorités' },
  { key: 'HIGH', label: 'HIGH' },
  { key: 'MEDIUM', label: 'MEDIUM' },
];

function RecCard({ rec, onDismiss }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`bg-white rounded-card border shadow-card transition-all ${rec.priority === 'HIGH' ? 'border-danger/40' : 'border-border'}`}>
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <PriorityBadge priority={rec.priority} />
            <TypeBadge type={rec.type} />
            {rec.brandLabel && (
              <span className="text-[11px] text-navy-muted bg-bg-page px-2 py-1 rounded-[6px]">{rec.brandLabel}</span>
            )}
            {rec.market && rec.market !== 'ALL' && (
              <span className="text-[11px] text-navy-muted bg-bg-page px-2 py-1 rounded-[6px]">{rec.market}</span>
            )}
          </div>
          <button onClick={() => onDismiss(rec.id)}
            className="flex-shrink-0 text-navy-muted hover:text-danger transition-colors"
            title="Masquer cette recommandation">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Campaign name */}
        <p className="text-sm font-semibold text-navy mb-2 leading-tight">{rec.campaign_name}</p>

        {/* Label */}
        <p className="text-xs text-navy-muted leading-relaxed mb-4">{rec.label}</p>

        {/* Action + Impact */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex-1 bg-bg-page rounded-inner px-3 py-2">
            <p className="text-[10px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-1">Action</p>
            <p className="text-xs font-semibold text-navy">{rec.action}</p>
          </div>
          {rec.impact_eur != null && rec.impact_eur > 0 && (
            <div className="bg-success-bg rounded-inner px-3 py-2 text-center min-w-[90px]">
              <p className="text-[10px] uppercase text-success font-medium tracking-[0.06em] mb-1">Impact</p>
              <p className="text-sm font-bold text-success">{fEur(rec.impact_eur)}</p>
            </div>
          )}
        </div>

        {/* Rationale toggle */}
        {rec.rationale && (
          <button onClick={() => setExpanded(!expanded)}
            className="mt-3 text-[11px] text-navy-muted hover:text-navy transition-colors flex items-center gap-1">
            <svg className={`w-3 h-3 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {expanded ? 'Masquer détails' : 'Voir détails'}
          </button>
        )}

        {expanded && rec.rationale && (
          <div className="mt-3 bg-bg-page rounded-inner px-3 py-2 text-[11px] text-navy-muted grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(rec.rationale).map(([k, v]) => (
              <div key={k} className="flex items-center justify-between">
                <span className="font-medium">{k.replace(/_/g, ' ')}</span>
                <span className="text-navy">{typeof v === 'number' ? v.toFixed(2) : String(v)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function RecommendationsView({ filters }) {
  const [brand, setBrand] = useState('ALL');
  const [market] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [priorityFilter, setPriorityFilter] = useState('ALL');
  const [hidden, setHidden] = useState(loadHidden);
  const [showDismissed, setShowDismissed] = useState(false);

  const { data: recs = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['recommendations', brand, market, typeFilter, priorityFilter],
    queryFn: () => fetchRecs({ brand, market, type: typeFilter, priority: priorityFilter }),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  function handleDismiss(id) {
    setHidden(prev => {
      const next = new Set(prev);
      next.add(id);
      saveHidden(next);
      return next;
    });
  }

  function handleRestore() {
    setHidden(new Set());
    saveHidden(new Set());
  }

  const visible = useMemo(() => recs.filter(r => !hidden.has(r.id)), [recs, hidden]);
  const dismissed = useMemo(() => recs.filter(r => hidden.has(r.id)), [recs, hidden]);

  const high = visible.filter(r => r.priority === 'HIGH').length;
  const medium = visible.filter(r => r.priority === 'MEDIUM').length;
  const totalImpact = visible.reduce((acc, r) => acc + (r.impact_eur || 0), 0);

  return (
    <div className="space-y-5">
      {/* Header + filters */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-navy">Recommandations SEA</h2>
          {high > 0 && (
            <span className="text-[11px] font-semibold px-2.5 py-1 rounded-[6px] bg-danger-bg text-danger border border-danger/30">
              {high} HIGH
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={brand} onChange={e => setBrand(e.target.value)}
            className="bg-white border border-border rounded-inner px-3 py-2 text-xs text-navy font-medium focus:border-navy outline-none shadow-card">
            {BRAND_OPTIONS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
            className="bg-white border border-border rounded-inner px-3 py-2 text-xs text-navy font-medium focus:border-navy outline-none shadow-card">
            {TYPE_OPTIONS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
          </select>
          <select value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}
            className="bg-white border border-border rounded-inner px-3 py-2 text-xs text-navy font-medium focus:border-navy outline-none shadow-card">
            {PRIORITY_OPTIONS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button onClick={() => refetch()}
            className="px-3 py-2 text-xs font-medium border border-border rounded-inner text-navy-muted hover:text-navy hover:border-navy-muted transition-colors">
            Actualiser
          </button>
        </div>
      </div>

      {/* KPI summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white rounded-card p-5 border border-border shadow-card">
          <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-2">Total</p>
          <p className="text-3xl font-bold text-navy">{visible.length}</p>
          <p className="text-xs text-navy-muted mt-1">recommandations</p>
        </div>
        <div className="bg-white rounded-card p-5 border border-danger/40 shadow-card">
          <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-2">Priorité HIGH</p>
          <p className="text-3xl font-bold text-danger">{high}</p>
          <p className="text-xs text-navy-muted mt-1">actions urgentes</p>
        </div>
        <div className="bg-white rounded-card p-5 border border-warning/40 shadow-card">
          <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-2">Priorité MEDIUM</p>
          <p className="text-3xl font-bold text-warning">{medium}</p>
          <p className="text-xs text-navy-muted mt-1">actions à planifier</p>
        </div>
        <div className="bg-white rounded-card p-5 border border-success/40 shadow-card">
          <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-2">Impact estimé</p>
          <p className="text-2xl font-bold text-success">{fEur(totalImpact)}</p>
          <p className="text-xs text-navy-muted mt-1">potentiel 30j</p>
        </div>
      </div>

      {/* Loading / Error */}
      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white rounded-card border border-border shadow-card p-5">
              <div className="skeleton h-5 w-1/3 mb-3 rounded" />
              <div className="skeleton h-4 w-full mb-2 rounded" />
              <div className="skeleton h-4 w-2/3 rounded" />
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="bg-danger-bg border border-danger/20 rounded-card px-4 py-3 text-xs text-danger font-medium">
          Erreur : {error?.message || 'Chargement échoué'}
        </div>
      )}

      {!isLoading && !isError && visible.length === 0 && (
        <div className="bg-success-bg border border-success/20 rounded-card px-6 py-8 text-center">
          <p className="text-success font-semibold text-sm mb-1">Aucune recommandation active</p>
          <p className="text-xs text-success/70">
            {dismissed.length > 0 ? `${dismissed.length} recommandation(s) masquée(s).` : 'Toutes les campagnes sont dans les clous.'}
          </p>
        </div>
      )}

      {/* Cards grid */}
      {!isLoading && visible.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
          {visible.map(rec => (
            <RecCard key={rec.id} rec={rec} onDismiss={handleDismiss} />
          ))}
        </div>
      )}

      {/* Dismissed section */}
      {dismissed.length > 0 && (
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setShowDismissed(!showDismissed)}
              className="text-xs text-navy-muted hover:text-navy transition-colors flex items-center gap-1.5">
              <svg className={`w-3.5 h-3.5 transition-transform ${showDismissed ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
              {dismissed.length} recommandation(s) masquée(s)
            </button>
            <button onClick={handleRestore}
              className="text-xs text-navy-muted hover:text-navy transition-colors underline">
              Tout restaurer
            </button>
          </div>
          {showDismissed && (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 opacity-50">
              {dismissed.map(rec => (
                <RecCard key={rec.id} rec={rec} onDismiss={() => {}} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
