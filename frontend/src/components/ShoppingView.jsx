import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fEur, fNum, fROAS } from '../utils/formatters';
import { fetchApi } from '../utils/api';
import AccordionSection from './AccordionSection';
import ShoppingScoringCharts from './ShoppingScoringCharts';

// ─── Helpers ──────────────────────────────────────────────

function fPct(v)      { if (v == null || isNaN(v)) return '—'; return v.toFixed(1) + '%'; }
function fROASx(v)    { if (v == null || isNaN(v)) return '—'; return v.toFixed(2) + '×'; }
function fImpr(v) {
  if (v == null) return '—';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k';
  return String(v);
}

function Skeleton({ rows = 5, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-9 rounded-inner" />
      ))}
    </div>
  );
}

function EmptyState({ msg = 'Aucune donnée disponible' }) {
  return <div className="text-center py-12 text-navy-muted text-sm">{msg}</div>;
}

function ErrorState({ msg }) {
  return <div className="text-center py-8 text-danger text-sm">{msg || 'Erreur de chargement'}</div>;
}

function deltaColor(v, invert = false) {
  if (v == null) return 'text-navy-muted';
  const pos = invert ? v < 0 : v > 0;
  return pos ? 'text-success' : v === 0 ? 'text-navy-muted' : 'text-danger';
}

function DeltaBadge({ v, suffix = '%', invert = false, decimals = 1 }) {
  if (v == null || isNaN(v)) return <span className="text-navy-muted text-xs">—</span>;
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '';
  const cls = deltaColor(v, invert);
  return <span className={`text-xs font-semibold ${cls}`}>{arrow} {v > 0 ? '+' : ''}{v.toFixed(decimals)}{suffix}</span>;
}

function CompBadge({ status, delta_pct }) {
  if (!status || status === 'NO_DATA') return <span className="text-[10px] text-navy-muted">—</span>;
  const fmt = delta_pct != null
    ? `${delta_pct > 0 ? '+' : ''}${delta_pct.toFixed(1)}%`
    : status;
  const cls = {
    COMPETITIVE: 'bg-success-bg text-success',
    ON_PAR:      'bg-[#E3F2FD] text-[#1565C0]',
    EXPENSIVE:   'bg-danger-bg text-danger',
  }[status] || 'bg-bg-page text-navy-muted';
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${cls}`}>{fmt}</span>;
}

// ─── Section 1 : Scorecards statut produits ──────────────

function ProductStatusCards({ data, isLoading }) {
  if (isLoading) return <div className="grid grid-cols-5 gap-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-card" />)}</div>;
  if (!data) return null;
  const total = data.total || 0;
  const pct = v => total > 0 ? (v / total) * 100 : 0;
  const cards = [
    { label: 'Actifs',     icon: '✓',  value: data.active,      color: 'text-success',   bg: 'bg-success-bg border-success/30',     showPct: true },
    { label: 'Refusés',    icon: '✕',  value: data.disapproved, color: 'text-danger',    bg: 'bg-danger-bg border-danger/30',       showPct: true },
    { label: 'Limités',    icon: '⚠',  value: data.limited,     color: 'text-warning',   bg: 'bg-warning-bg border-warning/30',     showPct: true },
    { label: 'En attente', icon: '◷',  value: data.pending,     color: 'text-navy-muted',bg: 'bg-bg-page border-border',            showPct: true },
    { label: 'Total',      icon: '▦',  value: data.total,       color: 'text-navy',      bg: 'bg-white border-border',              showPct: false },
  ];
  return (
    <div className="grid grid-cols-5 gap-3">
      {cards.map(c => (
        <div key={c.label} className={`p-4 rounded-card border-2 ${c.bg}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">{c.label}</span>
            <span className={`text-base font-bold ${c.color}`}>{c.icon}</span>
          </div>
          <p className={`text-2xl font-bold mb-1 ${c.color}`}>{fNum(c.value)}</p>
          {c.showPct && <p className="text-[11px] text-navy-muted">{pct(c.value).toFixed(1)}%</p>}
        </div>
      ))}
    </div>
  );
}

// ─── Section 2 : Scorecards compétitivité prix ───────────

function PriceScoreCards({ data, isLoading }) {
  if (isLoading) return <div className="grid grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="skeleton h-24 rounded-card" />)}</div>;
  if (!data) return null;
  const { counts, pct, total } = data;
  const cards = [
    { key: 'COMPETITIVE', label: 'Compétitifs',  icon: '✓', color: 'text-success',  bg: 'bg-success-bg border-success/30' },
    { key: 'ON_PAR',      label: 'Dans la norme',icon: '=', color: 'text-[#1565C0]',bg: 'bg-[#E3F2FD] border-[#1565C0]/20' },
    { key: 'EXPENSIVE',   label: 'Trop chers',   icon: '↑', color: 'text-danger',   bg: 'bg-danger-bg border-danger/30' },
    { key: 'NO_DATA',     label: 'Sans données', icon: '?', color: 'text-navy-muted',bg: 'bg-bg-page border-border' },
  ];
  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.key} className={`p-4 rounded-card border-2 ${c.bg}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">{c.label}</span>
            <span className={`text-base font-bold ${c.color}`}>{c.icon}</span>
          </div>
          <p className={`text-2xl font-bold mb-1 ${c.color}`}>{fNum(counts?.[c.key] || 0)}</p>
          <p className="text-[11px] text-navy-muted">{(pct?.[c.key] || 0).toFixed(1)}% des {fNum(total)} actifs</p>
        </div>
      ))}
    </div>
  );
}

// ─── Section 3 : Top marques (lazy) ──────────────────────

function BrandsAccordion({ filters, isOpen, onToggle }) {
  const { brand, market, from, to } = filters;
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shopping-brands-detail', brand, market, from, to],
    queryFn:  () => fetchApi('/api/shopping/brands-detail', { brand, market, from, to }),
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const totals = useMemo(() => {
    if (!data) return null;
    return {
      product_count: data.reduce((s, b) => s + (b.product_count || 0), 0),
      brand_count: data.length,
    };
  }, [data]);

  return (
    <AccordionSection
      title="Top marques produits"
      subtitle={totals ? `${fNum(totals.product_count)} produits · ${fNum(totals.brand_count)} marques` : null}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {isLoading && <Skeleton rows={8} />}
      {isError && <ErrorState msg={error?.message} />}
      {data && data.length === 0 && <EmptyState />}
      {data && data.length > 0 && <BrandsTable brands={data} filters={filters} />}
    </AccordionSection>
  );
}

function BrandsTable({ brands, filters }) {
  const [expanded, setExpanded] = useState(null); // product_brand
  const { sortKey, order, onSort } = useSort('revenue');

  const cpcOf = b => (b.clicks > 0 ? b.cost / b.clicks : 0);
  const sorted = useMemo(() => {
    const accessor = sortKey === 'cpc' ? cpcOf : (r => r[sortKey]);
    return sortRows(brands, sortKey, order, accessor);
  }, [brands, sortKey, order]);

  return (
    <div className="mt-4 overflow-x-auto max-h-[600px] overflow-y-auto">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-white z-10">
          <tr className="border-b border-border">
            <th className="w-8" />
            <SortableTh sortKey="product_brand" currentKey={sortKey} order={order} onSort={onSort} align="left">Marque</SortableTh>
            <SortableTh sortKey="product_count" currentKey={sortKey} order={order} onSort={onSort}>Produits</SortableTh>
            <SortableTh sortKey="impressions"   currentKey={sortKey} order={order} onSort={onSort}>Impr.</SortableTh>
            <SortableTh sortKey="clicks"        currentKey={sortKey} order={order} onSort={onSort}>Clics</SortableTh>
            <SortableTh sortKey="ctr"           currentKey={sortKey} order={order} onSort={onSort}>CTR</SortableTh>
            <SortableTh sortKey="cpc"           currentKey={sortKey} order={order} onSort={onSort}>CPC</SortableTh>
            <SortableTh sortKey="cost"          currentKey={sortKey} order={order} onSort={onSort}>Coût</SortableTh>
            <SortableTh sortKey="conversions"   currentKey={sortKey} order={order} onSort={onSort}>Conv.</SortableTh>
            <SortableTh sortKey="revenue"       currentKey={sortKey} order={order} onSort={onSort}>Revenue</SortableTh>
            <SortableTh sortKey="cvr"           currentKey={sortKey} order={order} onSort={onSort}>CVR</SortableTh>
            <SortableTh sortKey="roas"          currentKey={sortKey} order={order} onSort={onSort}>ROAS</SortableTh>
            <SortableTh sortKey="avg_delta_pct" currentKey={sortKey} order={order} onSort={onSort}>Δ Prix</SortableTh>
          </tr>
        </thead>
        <tbody>
          {sorted.map(b => {
            const isOpen = expanded === b.product_brand;
            const cpc = cpcOf(b);
            return (
              <React.Fragment key={b.product_brand}>
                <tr
                  className="border-b border-border hover:bg-bg-page cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : b.product_brand)}
                >
                  <td className="px-2 py-2.5 text-navy-muted">
                    <svg className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </td>
                  <td className="px-3 py-2.5 text-left font-medium text-navy">{b.product_brand}</td>
                  <Td>{fNum(b.product_count)}</Td>
                  <Td>{fImpr(b.impressions)}</Td>
                  <Td>{fNum(b.clicks)}</Td>
                  <Td>{fPct(b.ctr)}</Td>
                  <Td>{fEur(cpc)}</Td>
                  <Td>{fEur(b.cost)}</Td>
                  <Td>{fNum(Math.round(b.conversions))}</Td>
                  <Td className="font-semibold">{fEur(b.revenue)}</Td>
                  <Td>{fPct(b.cvr)}</Td>
                  <Td>{fROASx(b.roas)}</Td>
                  <td className="px-3 py-2.5 text-right">
                    <CompBadge status={b.avg_delta_pct == null ? 'NO_DATA' : b.avg_delta_pct < -5 ? 'COMPETITIVE' : b.avg_delta_pct > 5 ? 'EXPENSIVE' : 'ON_PAR'} delta_pct={b.avg_delta_pct} />
                  </td>
                </tr>
                {isOpen && <BrandDrillDown filters={filters} product_brand={b.product_brand} />}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function BrandDrillDown({ filters, product_brand }) {
  const { brand, market, from, to } = filters;
  const { data, isLoading, isError } = useQuery({
    queryKey: ['shopping-products-by-brand', brand, market, from, to, product_brand],
    queryFn:  () => fetchApi('/api/shopping/products-by-brand', { brand, market, from, to, product_brand }),
    enabled:  !!product_brand,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <tr>
      <td colSpan={13} className="bg-bg-page px-8 py-3">
        {isLoading && <Skeleton rows={3} />}
        {isError && <ErrorState />}
        {data && data.length === 0 && <div className="text-xs text-navy-muted">Aucun produit</div>}
        {data && data.length > 0 && (
          <div className="max-h-[400px] overflow-y-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1.5 text-left text-[10px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Produit</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Revenue</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-navy-muted uppercase tracking-[0.06em]">ROAS</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Notre prix</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Marché</th>
                <th className="px-2 py-1.5 text-right text-[10px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Δ</th>
              </tr>
            </thead>
            <tbody>
              {data.slice(0, 100).map(p => (
                <tr key={p.item_id} className="border-b border-border/50">
                  <td className="px-2 py-1.5 text-navy truncate max-w-md">{p.title || p.item_id}</td>
                  <td className="px-2 py-1.5 text-right text-navy">{fEur(p.revenue)}</td>
                  <td className="px-2 py-1.5 text-right text-navy">{fROASx(p.roas)}</td>
                  <td className="px-2 py-1.5 text-right text-navy">{p.price != null ? fEur(p.price) : '—'}</td>
                  <td className="px-2 py-1.5 text-right text-navy-muted">{p.benchmark_price != null ? fEur(p.benchmark_price) : '—'}</td>
                  <td className="px-2 py-1.5 text-right"><CompBadge status={p.price_status} delta_pct={p.delta_pct} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </td>
    </tr>
  );
}

// ─── Section 4 : Top & Flop (lazy) ───────────────────────

const TOP_FLOP_VIEWS = [
  { key: 'product',  label: 'Produit' },
  { key: 'brand',    label: 'Marque' },
  { key: 'category', label: 'Catégorie' },
];

function TopFlopAccordion({ filters, isOpen, onToggle }) {
  const [view, setView] = useState('product');
  const { brand, market, from, to, compareTo } = filters;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shopping-top-flop', brand, market, from, to, compareTo, view],
    queryFn:  () => fetchApi('/api/shopping/top-flop', { brand, market, from, to, compareTo, view, limit: 20 }),
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });

  return (
    <AccordionSection
      title="Top & Flop produits"
      subtitle={`${from} → ${to}`}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <div className="mt-3 mb-4 flex items-center gap-2">
        <span className="text-xs text-navy-muted uppercase tracking-[0.06em]">Vue :</span>
        <div className="flex bg-bg-page rounded-inner p-0.5">
          {TOP_FLOP_VIEWS.map(v => (
            <button key={v.key} onClick={() => setView(v.key)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${view === v.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <Skeleton rows={10} />}
      {isError && <ErrorState msg={error?.message} />}
      {data && (
        <div className="grid grid-cols-2 gap-4">
          <TopFlopTable title="📈 Top (meilleur trend)" rows={data.top} invert={false} />
          <TopFlopTable title="📉 Flop (pire trend)"    rows={data.flop} invert={true}  />
        </div>
      )}
    </AccordionSection>
  );
}

function TopFlopTable({ title, rows }) {
  const { sortKey, order, onSort } = useSort('delta_revenue');

  const sorted = useMemo(() => {
    if (!rows) return [];
    const accessor = {
      label:         r => r.label,
      revenue:       r => r.current?.revenue,
      delta_revenue: r => r.delta_revenue,
      roas:          r => r.current?.roas,
      delta_roas:    r => r.delta_roas,
    }[sortKey] || (r => r[sortKey]);
    return sortRows(rows, sortKey, order, accessor);
  }, [rows, sortKey, order]);

  if (!rows || rows.length === 0) return (
    <div>
      <h4 className="text-sm font-semibold text-navy mb-3">{title}</h4>
      <EmptyState msg="Pas de données" />
    </div>
  );
  return (
    <div>
      <h4 className="text-sm font-semibold text-navy mb-3">{title}</h4>
      <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-border">
              <SortableTh sortKey="label"         currentKey={sortKey} order={order} onSort={onSort} align="left">Libellé</SortableTh>
              <SortableTh sortKey="revenue"       currentKey={sortKey} order={order} onSort={onSort}>Rev.</SortableTh>
              <SortableTh sortKey="delta_revenue" currentKey={sortKey} order={order} onSort={onSort}>Δ Rev.</SortableTh>
              <SortableTh sortKey="roas"          currentKey={sortKey} order={order} onSort={onSort}>ROAS</SortableTh>
              <SortableTh sortKey="delta_roas"    currentKey={sortKey} order={order} onSort={onSort}>Δ ROAS</SortableTh>
            </tr>
          </thead>
          <tbody>
            {sorted.map(r => (
              <tr key={r.key} className="border-b border-border/50">
                <td className="px-2 py-1.5 text-navy truncate max-w-[220px]" title={r.label}>{r.label}</td>
                <td className="px-2 py-1.5 text-right text-navy">{fEur(r.current?.revenue)}</td>
                <td className="px-2 py-1.5 text-right"><DeltaBadge v={r.delta_revenue} /></td>
                <td className="px-2 py-1.5 text-right text-navy">{fROASx(r.current?.roas)}</td>
                <td className="px-2 py-1.5 text-right"><DeltaBadge v={r.delta_roas} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Section 5 : Qualité du flux (lazy) ──────────────────

const ISSUE_TYPES = [
  { key: 'image',        label: 'Image',        icon: '🖼' },
  { key: 'description',  label: 'Description',  icon: '📝' },
  { key: 'gtin',         label: 'GTIN',         icon: '🏷' },
  { key: 'category',     label: 'Catégorie',    icon: '📦' },
  { key: 'shipping',     label: 'Shipping',     icon: '🚚' },
  { key: 'price',        label: 'Prix',         icon: '💶' },
  { key: 'availability', label: 'Dispo.',       icon: '📅' },
  { key: 'other',        label: 'Autre',        icon: '…' },
];

function FeedQualityAccordion({ filters, isOpen, onToggle, issuesCount }) {
  const { brand, market } = filters;
  const [filterType, setFilterType] = useState('ALL');
  const [search, setSearch] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shopping-feed-quality', brand, market],
    queryFn:  () => fetchApi('/api/shopping/feed-quality', { brand, market }),
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    if (!data?.products) return [];
    const q = search.trim().toLowerCase();
    return data.products.filter(p => {
      if (filterType !== 'ALL' && !p.issues.some(i => i.type === filterType.toUpperCase())) return false;
      if (q && !(p.title || '').toLowerCase().includes(q) && !(p.item_id || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [data, filterType, search]);

  return (
    <AccordionSection
      title="Qualité du flux Merchant Center"
      subtitle={issuesCount != null ? `${fNum(issuesCount)} produits avec problèmes` : null}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {isLoading && <Skeleton rows={8} />}
      {isError && <ErrorState msg={error?.message} />}
      {data && (
        <>
          <div className="mt-4 grid grid-cols-8 gap-2">
            {ISSUE_TYPES.map(t => (
              <button
                key={t.key}
                onClick={() => setFilterType(filterType === t.key.toUpperCase() ? 'ALL' : t.key.toUpperCase())}
                className={`p-2 rounded-card border text-center transition-all ${filterType === t.key.toUpperCase() ? 'border-navy bg-bg-page' : 'border-border bg-white hover:border-navy-muted'}`}
              >
                <div className="text-base mb-0.5">{t.icon}</div>
                <div className="text-[10px] text-navy-muted">{t.label}</div>
                <div className="text-sm font-bold text-navy">{fNum(data.summary?.[t.key] || 0)}</div>
              </button>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Rechercher produit ou ID..."
              className="bg-bg-page text-navy text-xs px-3 py-1.5 rounded-inner border border-border focus:border-navy outline-none flex-1 max-w-xs"
            />
            <span className="text-xs text-navy-muted">{fNum(filtered.length)} produit{filtered.length > 1 ? 's' : ''}</span>
          </div>

          <div className="mt-3 overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-border">
                  <Th align="left">Produit</Th>
                  <Th align="left">Marque</Th>
                  <Th align="left">Problèmes</Th>
                  <Th align="left">Sévérité</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, 300).map(p => (
                  <tr key={p.item_id} className="border-b border-border hover:bg-bg-page">
                    <td className="px-3 py-2 text-navy text-xs max-w-md truncate" title={p.title}>{p.title || p.item_id}</td>
                    <td className="px-3 py-2 text-navy-muted text-xs">{p.brand || '—'}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        {p.issues.slice(0, 3).map((i, idx) => (
                          <span key={idx} className="text-[11px] text-navy" title={i.code || i.type}>
                            {i.description || i.code || i.type}
                          </span>
                        ))}
                        {p.issues.length > 3 && <span className="text-[10px] text-navy-muted">+{p.issues.length - 3} autre{p.issues.length - 3 > 1 ? 's' : ''}</span>}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs">
                      <SeverityBadge severity={p.severity} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AccordionSection>
  );
}

function SeverityBadge({ severity }) {
  const map = {
    disapproved: { label: 'Refusé',  cls: 'bg-danger-bg text-danger' },
    limited:     { label: 'Limité',  cls: 'bg-warning-bg text-warning' },
    pending:     { label: 'Attente', cls: 'bg-bg-page text-navy-muted' },
    active:      { label: 'OK',      cls: 'bg-success-bg text-success' },
  };
  const m = map[severity] || map.pending;
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${m.cls}`}>{m.label}</span>;
}

// ─── Section 6 : Produits en promo (lazy) ────────────────

function PromosAccordion({ filters, isOpen, onToggle }) {
  const { brand, market } = filters;
  const [brandFilter, setBrandFilter] = useState('ALL');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shopping-promos', brand, market],
    queryFn:  () => fetchApi('/api/shopping/promos', { brand, market }),
    enabled:  isOpen,
    staleTime: 5 * 60 * 1000,
  });

  const brandOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.map(p => p.brand).filter(Boolean))).sort();
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return brandFilter === 'ALL' ? data : data.filter(p => p.brand === brandFilter);
  }, [data, brandFilter]);

  const promoSort = useSort('discount_pct', 'asc'); // most negative (biggest discount) first
  const sortedPromos = useMemo(
    () => sortRows(filtered, promoSort.sortKey, promoSort.order),
    [filtered, promoSort.sortKey, promoSort.order]
  );

  const stats = useMemo(() => {
    if (!filtered.length) return null;
    const avg = filtered.reduce((s, p) => s + p.discount_pct, 0) / filtered.length;
    const comp = filtered.filter(p => p.market_status === 'COMPETITIVE').length;
    return { count: filtered.length, avg_discount: avg, competitive: comp };
  }, [filtered]);

  return (
    <AccordionSection
      title="Produits en promotion"
      subtitle={data ? `${fNum(data.length)} produits en promo` : null}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {isLoading && <Skeleton rows={8} />}
      {isError && <ErrorState msg={error?.message} />}
      {data && data.length === 0 && <EmptyState msg="Aucun produit en promo actuellement" />}
      {data && data.length > 0 && (
        <>
          <div className="mt-4 flex items-center gap-4 flex-wrap">
            {stats && (
              <div className="text-xs text-navy-muted">
                <strong className="text-navy">{fNum(stats.count)}</strong> produits ·
                Remise moyenne : <strong className="text-navy">{stats.avg_discount.toFixed(1)}%</strong> ·
                <strong className="text-success">{fNum(stats.competitive)}</strong> compétitifs vs marché ({fPct(stats.count > 0 ? (stats.competitive / stats.count) * 100 : 0)})
              </div>
            )}
            {brandOptions.length > 0 && (
              <select
                value={brandFilter} onChange={e => setBrandFilter(e.target.value)}
                className="bg-bg-page text-navy text-xs px-2 py-1 rounded-inner border border-border focus:border-navy outline-none ml-auto"
              >
                <option value="ALL">Toutes les marques</option>
                {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            )}
          </div>

          <div className="mt-3 overflow-x-auto max-h-[600px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-border">
                  <SortableTh sortKey="title"            currentKey={promoSort.sortKey} order={promoSort.order} onSort={promoSort.onSort} align="left">Produit</SortableTh>
                  <SortableTh sortKey="brand"            currentKey={promoSort.sortKey} order={promoSort.order} onSort={promoSort.onSort} align="left">Marque</SortableTh>
                  <SortableTh sortKey="original_price"   currentKey={promoSort.sortKey} order={promoSort.order} onSort={promoSort.onSort}>Prix orig.</SortableTh>
                  <SortableTh sortKey="sale_price"       currentKey={promoSort.sortKey} order={promoSort.order} onSort={promoSort.onSort}>Prix promo</SortableTh>
                  <SortableTh sortKey="discount_pct"     currentKey={promoSort.sortKey} order={promoSort.order} onSort={promoSort.onSort}>Remise</SortableTh>
                  <SortableTh sortKey="delta_vs_market"  currentKey={promoSort.sortKey} order={promoSort.order} onSort={promoSort.onSort}>Δ vs marché</SortableTh>
                  <Th align="left">Dates</Th>
                </tr>
              </thead>
              <tbody>
                {sortedPromos.slice(0, 500).map(p => (
                  <tr key={p.item_id} className="border-b border-border hover:bg-bg-page">
                    <td className="px-3 py-2 text-navy text-xs max-w-md truncate" title={p.title}>{p.title || p.item_id}</td>
                    <td className="px-3 py-2 text-navy-muted text-xs">{p.brand || '—'}</td>
                    <td className="px-3 py-2 text-right text-navy text-xs line-through">{fEur(p.original_price)}</td>
                    <td className="px-3 py-2 text-right text-navy text-xs font-semibold">{fEur(p.sale_price)}</td>
                    <td className="px-3 py-2 text-right text-xs font-semibold text-danger">{p.discount_pct.toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right"><CompBadge status={p.market_status} delta_pct={p.delta_vs_market} /></td>
                    <td className="px-3 py-2 text-navy-muted text-xs">{formatPromoDates(p.promo_start, p.promo_end)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </AccordionSection>
  );
}

function formatPromoDates(start, end) {
  if (!start && !end) return 'Pas de date';
  const f = d => {
    if (!d) return '—';
    const s = String(d).slice(0, 10);
    const parts = s.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}`;
    return s;
  };
  return `${f(start)} → ${f(end)}`;
}

// ─── Table helpers ────────────────────────────────────────

function Th({ children, align = 'right' }) {
  return (
    <th className={`px-3 py-2.5 text-${align} text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]`}>
      {children}
    </th>
  );
}

function SortableTh({ children, sortKey, currentKey, order, onSort, align = 'right' }) {
  const active = currentKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`px-3 py-2.5 text-${align} text-[11px] font-semibold uppercase tracking-[0.06em] cursor-pointer select-none transition-colors ${active ? 'text-navy' : 'text-navy-muted hover:text-navy'}`}
    >
      {children}
      <span className="ml-1 text-[10px]">{active ? (order === 'desc' ? '↓' : '↑') : '⇅'}</span>
    </th>
  );
}

function useSort(initialKey, initialOrder = 'desc') {
  const [sortKey, setSortKey] = useState(initialKey);
  const [order, setOrder]     = useState(initialOrder);
  function onSort(key) {
    if (sortKey === key) setOrder(o => (o === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setOrder('desc'); }
  }
  return { sortKey, order, onSort };
}

function sortRows(rows, key, order, accessor = r => r[key]) {
  const dir = order === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const av = accessor(a);
    const bv = accessor(b);
    if (av == null && bv == null) return 0;
    if (av == null) return 1;  // nulls always last
    if (bv == null) return -1;
    if (typeof av === 'string') return dir * av.localeCompare(bv);
    return dir * (av - bv);
  });
}

function Td({ children, className = '' }) {
  return (
    <td className={`px-3 py-2.5 text-right text-navy ${className}`}>{children}</td>
  );
}

// ─── Main view ────────────────────────────────────────────

export default function ShoppingView({ filters }) {
  const [openSection, setOpenSection] = useState(null);
  const { brand, market, from, to } = filters;

  // Section 1 — Scorecards statut produits (immediate)
  const statusQuery = useQuery({
    queryKey: ['shopping-product-status-summary', brand, market],
    queryFn:  () => fetchApi('/api/shopping/product-status-summary', { brand, market }),
    staleTime: 5 * 60 * 1000,
  });

  // Section 2 — Scorecards compétitivité prix (immediate)
  const priceQuery = useQuery({
    queryKey: ['shopping-price-summary', brand, market, from, to],
    queryFn:  () => fetchApi('/api/shopping/price-summary', { brand, market, from, to }),
    enabled:  !!from && !!to,
    staleTime: 15 * 60 * 1000,
  });

  // Feed quality counter (also immediate, to populate the badge)
  const feedSummaryQuery = useQuery({
    queryKey: ['shopping-feed-quality-summary', brand, market],
    queryFn:  () => fetchApi('/api/shopping/feed-quality', { brand, market }),
    staleTime: 5 * 60 * 1000,
    select: d => d?.products?.length ?? 0,
  });

  function toggle(key) {
    setOpenSection(openSection === key ? null : key);
  }

  return (
    <div className="space-y-4">
      {/* Section 1 : Statut produits */}
      <ProductStatusCards data={statusQuery.data} isLoading={statusQuery.isLoading} />

      {/* Section 2 : Compétitivité prix */}
      <PriceScoreCards data={priceQuery.data} isLoading={priceQuery.isLoading} />

      {/* Section 3 : Top marques (lazy) */}
      <BrandsAccordion
        filters={filters}
        isOpen={openSection === 'brands'}
        onToggle={() => toggle('brands')}
      />

      {/* Section 4 : Top & Flop (lazy) */}
      <TopFlopAccordion
        filters={filters}
        isOpen={openSection === 'topflop'}
        onToggle={() => toggle('topflop')}
      />

      {/* Section 5 : Qualité du flux (lazy) */}
      <FeedQualityAccordion
        filters={filters}
        isOpen={openSection === 'feed'}
        onToggle={() => toggle('feed')}
        issuesCount={feedSummaryQuery.data}
      />

      {/* Section 6 : Produits en promo (lazy) */}
      <PromosAccordion
        filters={filters}
        isOpen={openSection === 'promos'}
        onToggle={() => toggle('promos')}
      />

      {/* Scoring charts (CC FR only — hidden unless brand=CC and market=FR) */}
      {brand === 'COCOONCENTER' && market === 'FR' && (
        <ShoppingScoringCharts brand={brand} market={market} from={from} to={to} />
      )}
    </div>
  );
}
