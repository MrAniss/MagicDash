import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fEur, fNum, fROAS } from '../utils/formatters';

// ─── Helpers ──────────────────────────────────────────────

function subDays(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function today() { return new Date().toISOString().slice(0, 10); }

function getPreset(key) {
  const presets = {
    '14j': { from: subDays(14), to: today() },
    '30j': { from: subDays(30), to: today() },
    '60j': { from: subDays(60), to: today() },
    '90j': { from: subDays(90), to: today() },
  };
  return presets[key] || presets['30j'];
}

function fPct(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(2) + '%';
}

function fROASx(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(2) + '×';
}

function fImpr(v) {
  if (v == null) return '—';
  if (v >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(0) + 'k';
  return String(v);
}

function deltaColor(v, invert = false) {
  if (v == null) return 'text-navy-muted';
  const pos = invert ? v < 0 : v > 0;
  return pos ? 'text-success' : v === 0 ? 'text-navy-muted' : 'text-danger';
}

function DeltaBadge({ v, suffix = '%', invert = false }) {
  if (v == null) return <span className="text-navy-muted">—</span>;
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '';
  const cls = deltaColor(v, invert);
  return <span className={`text-xs font-semibold ${cls}`}>{arrow} {v > 0 ? '+' : ''}{v.toFixed(1)}{suffix}</span>;
}

async function fetchApi(path, params = {}) {
  const url = new URL(path, window.location.origin);
  Object.entries(params).forEach(([k, v]) => { if (v != null && v !== '') url.searchParams.set(k, v); });
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// ─── Segment config ───────────────────────────────────────

const SEGMENTS = [
  { key: 'ALL',             label: 'Tous',               icon: '📦', color: 'bg-bg-page text-navy border-border' },
  { key: 'TOP',             label: 'Top performers',     icon: '⭐', color: 'bg-success-bg text-success border-success/30' },
  { key: 'ZOMBIE',          label: 'Zombies',             icon: '💀', color: 'bg-[#F3E8FF] text-[#7C3AED] border-[#7C3AED]/20' },
  { key: 'TRAFIC_SANS_CONV',label: 'Trafic sans conv.',  icon: '⚠️', color: 'bg-warning-bg text-warning border-warning/30' },
  { key: 'SOUS_PERF',       label: 'Sous-perf.',         icon: '📉', color: 'bg-danger-bg text-danger border-danger/30' },
];

const TREND_OPTIONS = [
  { key: 'ALL',    label: 'Tous' },
  { key: 'UP',     label: 'En hausse' },
  { key: 'DOWN',   label: 'En baisse' },
  { key: 'NEW',    label: 'Nouveaux' },
  { key: 'GONE',   label: 'Disparus' },
];

const BRAND_OPTIONS = [
  { key: 'ALL',                    label: 'Toutes les marques' },
  { key: 'COCOONCENTER',           label: 'Cocooncenter' },
  { key: 'PASCAL_COSTE',           label: 'Pascal Coste Shopping' },
  { key: 'PARAPHARMACIE_LAFAYETTE',label: 'Para. Lafayette' },
];

const PRICE_STATUS_OPTIONS = [
  { key: 'ALL',         label: 'Tous',         cls: 'bg-bg-page text-navy border-border' },
  { key: 'COMPETITIVE', label: 'Compétitif',   cls: 'bg-success-bg text-success border-success/30' },
  { key: 'ON_PAR',      label: 'À parité',     cls: 'bg-[#E3F2FD] text-[#1565C0] border-[#1565C0]/20' },
  { key: 'EXPENSIVE',   label: 'Trop cher',    cls: 'bg-danger-bg text-danger border-danger/30' },
  { key: 'NO_DATA',     label: 'Sans données', cls: 'bg-bg-page text-navy-muted border-border' },
];

const PRESETS = ['14j', '30j', '60j', '90j'];
const COMPARE_OPTIONS = [
  { key: 'previous_period', label: 'Période préc.' },
  { key: 'previous_year',   label: 'N-1' },
];

// ─── Sub-components ───────────────────────────────────────

function SortableHeader({ col, label, sortKey, onSort, order, className = '' }) {
  const active = sortKey === col;
  return (
    <th onClick={() => onSort(col)}
      className={`px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer select-none hover:text-navy transition-colors ${className}`}>
      {label} {active ? (order === 'desc' ? '↓' : '↑') : ''}
    </th>
  );
}

function Skeleton({ rows = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton h-9 rounded-inner" />
      ))}
    </div>
  );
}

function EmptyState({ msg = 'Aucune donnée disponible' }) {
  return (
    <div className="text-center py-12 text-navy-muted text-sm">{msg}</div>
  );
}

function SectionCard({ title, children, collapsible = false, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      <div
        className={`px-6 py-4 flex items-center justify-between ${collapsible ? 'cursor-pointer hover:bg-bg-page transition-colors' : ''}`}
        onClick={collapsible ? () => setOpen(!open) : undefined}>
        <h3 className="text-base font-semibold text-navy">{title}</h3>
        {collapsible && (
          <svg className={`w-4 h-4 text-navy-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </div>
      {open && <div className="px-6 pb-6 pt-0">{children}</div>}
    </div>
  );
}

// ─── Section 1 : KPI Cards ────────────────────────────────

function KpiCards({ summary, prevSummary }) {
  if (!summary) return <Skeleton rows={1} />;

  function pctDelta(curr, prev) {
    if (!prev || prev === 0) return null;
    return ((curr - prev) / prev) * 100;
  }

  const cards = [
    {
      label: 'Produits actifs',
      value: fNum(summary.active) + ' / ' + fNum(summary.total),
      delta: null, suffix: '',
    },
    {
      label: 'Revenue',
      value: fEur(summary.revenue),
      delta: prevSummary ? pctDelta(summary.revenue, prevSummary.revenue) : null,
      suffix: '%',
    },
    {
      label: 'ROAS moyen',
      value: fROASx(summary.avg_roas),
      delta: prevSummary ? summary.avg_roas - prevSummary.avg_roas : null,
      suffix: '',
    },
    {
      label: 'Conversions',
      value: fNum(summary.conversions),
      delta: prevSummary ? pctDelta(summary.conversions, prevSummary.conversions) : null,
      suffix: '%',
    },
    {
      label: 'CVR moyen',
      value: fPct(summary.avg_cvr),
      delta: prevSummary ? summary.avg_cvr - prevSummary.avg_cvr : null,
      suffix: 'pt',
    },
  ];

  return (
    <div className="grid grid-cols-5 gap-4">
      {cards.map(c => (
        <div key={c.label} className="bg-white rounded-card p-5 border border-border shadow-card">
          <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-2">{c.label}</p>
          <p className="text-2xl font-bold text-navy mb-2">{c.value}</p>
          {c.delta != null && <DeltaBadge v={c.delta} suffix={c.suffix} />}
        </div>
      ))}
    </div>
  );
}

// ─── Section 2 : Segment badges ───────────────────────────

function SegmentBadges({ segments, segmentRevenue, totalRevenue, activeSegment, onSegmentChange }) {
  if (!segments) return null;
  return (
    <div className="grid grid-cols-5 gap-3">
      {SEGMENTS.map(s => {
        const count = s.key === 'ALL' ? Object.values(segments).reduce((a, b) => a + b, 0) : (segments[s.key] || 0);
        const rev = s.key === 'ALL' ? totalRevenue : (segmentRevenue?.[s.key] || 0);
        const revShare = totalRevenue > 0 ? ((rev / totalRevenue) * 100).toFixed(1) : 0;
        const isActive = activeSegment === s.key;
        return (
          <button key={s.key} onClick={() => onSegmentChange(s.key)}
            className={`text-left p-4 rounded-card border-2 transition-all ${isActive ? s.color + ' border-2' : 'bg-white border-border text-navy hover:border-navy-muted'}`}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">{s.icon}</span>
              <span className="text-xs font-semibold">{s.label}</span>
            </div>
            <p className="text-2xl font-bold mb-1">{fNum(count)}</p>
            {s.key !== 'ALL' && (
              <p className="text-[11px] opacity-70">{revShare}% du revenue</p>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── Price competitiveness helpers ────────────────────────

function CompetitiveBadge({ status, delta_pct }) {
  if (!status || status === 'NO_DATA') return <span className="text-[10px] text-navy-muted">—</span>;
  const meta = {
    COMPETITIVE: { label: delta_pct != null ? `−${Math.abs(delta_pct).toFixed(1)}%` : 'Compétitif', cls: 'bg-success-bg text-success' },
    ON_PAR:      { label: delta_pct != null ? `${delta_pct > 0 ? '+' : ''}${delta_pct.toFixed(1)}%` : 'À parité', cls: 'bg-[#E3F2FD] text-[#1565C0]' },
    EXPENSIVE:   { label: delta_pct != null ? `+${delta_pct.toFixed(1)}%` : 'Trop cher',    cls: 'bg-danger-bg text-danger' },
  }[status] || { label: status, cls: 'bg-bg-page text-navy-muted' };
  return <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>;
}

function PriceScoreCards({ priceSummary, isLoading, activeStatus, onStatusChange }) {
  if (isLoading) return <div className="skeleton h-24 rounded-card" />;
  if (!priceSummary) return null;

  const { counts, pct, total } = priceSummary;
  const cards = [
    { key: 'COMPETITIVE', label: 'Compétitifs',   count: counts.COMPETITIVE, pct: pct.COMPETITIVE, icon: '✓', cls: 'text-success', bg: 'bg-success-bg border-success/30' },
    { key: 'ON_PAR',      label: 'À parité',      count: counts.ON_PAR,      pct: pct.ON_PAR,      icon: '=', cls: 'text-[#1565C0]', bg: 'bg-[#E3F2FD] border-[#1565C0]/20' },
    { key: 'EXPENSIVE',   label: 'Trop chers',    count: counts.EXPENSIVE,   pct: pct.EXPENSIVE,   icon: '↑', cls: 'text-danger',   bg: 'bg-danger-bg border-danger/30' },
    { key: 'NO_DATA',     label: 'Sans données',  count: counts.NO_DATA,     pct: pct.NO_DATA,     icon: '?', cls: 'text-navy-muted', bg: 'bg-bg-page border-border' },
  ];

  return (
    <div className="grid grid-cols-4 gap-3">
      {cards.map(c => {
        const isActive = activeStatus === c.key;
        return (
          <button key={c.key} onClick={() => onStatusChange(isActive ? 'ALL' : c.key)}
            className={`text-left p-4 rounded-card border-2 transition-all ${isActive ? c.bg : 'bg-white border-border hover:border-navy-muted'}`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-navy-muted uppercase tracking-[0.06em]">{c.label}</span>
              <span className={`text-base font-bold ${c.cls}`}>{c.icon}</span>
            </div>
            <p className={`text-2xl font-bold mb-1 ${isActive ? c.cls : 'text-navy'}`}>{fNum(c.count)}</p>
            <p className="text-[11px] text-navy-muted">{c.pct?.toFixed(1)}% des {fNum(total)} produits actifs</p>
          </button>
        );
      })}
    </div>
  );
}

// ─── Section 3 : Brands table ─────────────────────────────

function BrandsTable({ brands, isLoading, showAll, onToggleAll }) {
  const [sortKey, setSortKey] = useState('revenue');
  const [order, setOrder] = useState('desc');

  function handleSort(col) {
    if (sortKey === col) setOrder(o => o === 'desc' ? 'asc' : 'desc');
    else { setSortKey(col); setOrder('desc'); }
  }

  const sorted = useMemo(() => {
    if (!brands) return [];
    const dir = order === 'desc' ? -1 : 1;
    return [...brands].sort((a, b) => dir * ((a[sortKey] || 0) - (b[sortKey] || 0)));
  }, [brands, sortKey, order]);

  const displayed = showAll ? sorted : sorted.slice(0, 20);

  if (isLoading) return <Skeleton />;
  if (!sorted.length) return <EmptyState />;

  const maxRev = sorted[0]?.revenue || 1;

  return (
    <div>
      <div className="overflow-x-auto max-h-[480px] overflow-y-auto rounded-inner border border-border">
        <table className="w-full text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-bg-page border-b-2 border-border">
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Marque</th>
              <SortableHeader col="product_count" label="Produits" sortKey={sortKey} onSort={handleSort} order={order} />
              <SortableHeader col="impressions"   label="Impr."    sortKey={sortKey} onSort={handleSort} order={order} />
              <SortableHeader col="clicks"        label="Clics"    sortKey={sortKey} onSort={handleSort} order={order} />
              <SortableHeader col="revenue"       label="Revenue"  sortKey={sortKey} onSort={handleSort} order={order} />
              <SortableHeader col="roas"          label="ROAS"     sortKey={sortKey} onSort={handleSort} order={order} />
              <SortableHeader col="cvr"           label="CVR"      sortKey={sortKey} onSort={handleSort} order={order} />
              <SortableHeader col="conversions"   label="Conv."    sortKey={sortKey} onSort={handleSort} order={order} />
              <SortableHeader col="cost"          label="Coût"     sortKey={sortKey} onSort={handleSort} order={order} />
              <SortableHeader col="avg_delta_pct" label="Δ Prix"   sortKey={sortKey} onSort={handleSort} order={order} />
            </tr>
          </thead>
          <tbody>
            {displayed.map((b, i) => (
              <tr key={b.product_brand} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                <td className="px-3 py-2.5 font-medium text-navy group-hover:text-white">
                  <div className="flex items-center gap-2">
                    <span>{b.product_brand}</span>
                    <div className="flex-1 h-1.5 bg-bg-page rounded-full overflow-hidden group-hover:bg-white/20 max-w-[60px]">
                      <div className="h-full bg-navy/30 group-hover:bg-white/60 rounded-full" style={{ width: `${Math.min((b.revenue / maxRev) * 100, 100)}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fNum(b.product_count)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fImpr(b.impressions)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fNum(b.clicks)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-navy group-hover:text-white">{fEur(b.revenue)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fROASx(b.roas)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fPct(b.cvr)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fNum(b.conversions)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fEur(b.cost)}</td>
                <td className="px-3 py-2.5 text-right">
                  {b.avg_delta_pct != null
                    ? <DeltaBadge v={b.avg_delta_pct} suffix="%" invert={true} />
                    : <span className="text-navy-muted group-hover:text-white/50">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > 20 && (
        <div className="mt-4 text-center">
          <button onClick={onToggleAll}
            className="text-xs font-medium text-navy-muted hover:text-navy underline transition-colors">
            {showAll ? `Voir moins (20/${sorted.length})` : `Voir tout (${sorted.length} marques)`}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Section 4 : Products table ───────────────────────────

function SegmentChip({ segment }) {
  const meta = {
    TOP:             { label: 'Top',           cls: 'bg-success-bg text-success' },
    ZOMBIE:          { label: 'Zombie',         cls: 'bg-[#F3E8FF] text-[#7C3AED]' },
    TRAFIC_SANS_CONV:{ label: 'Trafic',        cls: 'bg-warning-bg text-warning' },
    SOUS_PERF:       { label: 'Sous-perf',     cls: 'bg-danger-bg text-danger' },
    STANDARD:        { label: 'Standard',      cls: 'bg-bg-page text-navy-muted' },
  }[segment] || { label: segment, cls: 'bg-bg-page text-navy-muted' };
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${meta.cls}`}>{meta.label}</span>;
}

function ProductsTable({ data, isLoading, totalFiltered, offset, onOffset, sortKey, order, onSort, brandOptions }) {
  const PAGE = 50;

  if (isLoading) return <Skeleton rows={8} />;
  if (!data?.products?.length) return <EmptyState />;

  const products = data.products;
  const total = totalFiltered || 0;

  return (
    <div>
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto rounded-inner border border-border">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-bg-page border-b-2 border-border">
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Produit</th>
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Marque</th>
              <SortableHeader col="impressions" label="Impr."   sortKey={sortKey} onSort={onSort} order={order} />
              <SortableHeader col="clicks"      label="Clics"   sortKey={sortKey} onSort={onSort} order={order} />
              <SortableHeader col="revenue"         label="Revenue"    sortKey={sortKey} onSort={onSort} order={order} />
              <SortableHeader col="conversions"     label="Conv."      sortKey={sortKey} onSort={onSort} order={order} />
              <SortableHeader col="cost"            label="Coût"       sortKey={sortKey} onSort={onSort} order={order} />
              <SortableHeader col="price"           label="Notre prix" sortKey={sortKey} onSort={onSort} order={order} />
              <SortableHeader col="benchmark_price" label="Prix marché"   sortKey={sortKey} onSort={onSort} order={order} />
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Compétitivité</th>
              <SortableHeader col="roas"             label="ROAS"         sortKey={sortKey} onSort={onSort} order={order} />
              <SortableHeader col="cvr"              label="CVR"          sortKey={sortKey} onSort={onSort} order={order} />
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Segment</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p, i) => (
              <tr key={`${p.brand}|${p.market}|${p.item_id}`}
                className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                <td className="px-3 py-2.5 max-w-[280px]">
                  <p className="text-navy font-medium group-hover:text-white truncate">{p.title || p.item_id}</p>
                  <p className="text-[10px] text-navy-muted group-hover:text-white/70">{p.item_id} · {p.market}</p>
                </td>
                <td className="px-3 py-2.5 text-navy-muted text-[11px] group-hover:text-white/70 max-w-[100px] truncate">{p.product_brand || '—'}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fImpr(p.impressions)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fNum(p.clicks)}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-navy group-hover:text-white">{fEur(p.revenue)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fNum(p.conversions)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fEur(p.cost)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-navy group-hover:text-white">
                  {p.price != null ? fEur(p.price) : <span className="text-navy-muted">—</span>}
                </td>
                <td className="px-3 py-2.5 text-right text-navy-muted group-hover:text-white/70">
                  {p.benchmark_price != null ? fEur(p.benchmark_price) : '—'}
                </td>
                <td className="px-3 py-2.5 text-center">
                  <CompetitiveBadge status={p.price_status} delta_pct={p.delta_pct} />
                </td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fROASx(p.roas)}</td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fPct(p.cvr)}</td>
                <td className="px-3 py-2.5 text-center"><SegmentChip segment={p.segment} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {total > PAGE && (
        <div className="flex items-center justify-between mt-4 text-xs text-navy-muted">
          <span>{offset + 1}–{Math.min(offset + PAGE, total)} sur {fNum(total)} produits</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => onOffset(Math.max(0, offset - PAGE))}
              className="px-3 py-1.5 border border-border rounded-inner hover:border-navy disabled:opacity-40 disabled:cursor-not-allowed">
              Préc.
            </button>
            <button disabled={offset + PAGE >= total} onClick={() => onOffset(offset + PAGE)}
              className="px-3 py-1.5 border border-border rounded-inner hover:border-navy disabled:opacity-40 disabled:cursor-not-allowed">
              Suiv.
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Section 6 : Low CVR ─────────────────────────────────

function getSuggestedAction(p) {
  if (p.cost > 100 && p.cvr < 0.5)   return 'Vérifier compétitivité prix vs concurrents';
  if (p.ctr > 5   && p.cvr < 1)      return 'Fort intérêt mais pas de conversion — vérifier la page produit';
  return 'Analyser le funnel conversion';
}

function LowCvrTable({ products, isLoading }) {
  if (isLoading) return <Skeleton rows={5} />;
  const low = (products || []).slice(0, 100);
  if (!low.length) return <EmptyState msg="Aucun produit avec > 50 clics et CVR < 1%" />;
  return (
    <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-inner border border-border">
      <table className="w-full text-[12px]">
        <thead className="sticky top-0 z-10">
          <tr className="bg-bg-page border-b-2 border-border">
            <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Produit</th>
            <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Clics</th>
            <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">CVR</th>
            <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Coût</th>
            <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Action suggérée</th>
          </tr>
        </thead>
        <tbody>
          {low.map((p, i) => (
            <tr key={`${p.brand}|${p.item_id}`} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
              <td className="px-3 py-2.5 max-w-[260px]">
                <p className="text-navy font-medium group-hover:text-white truncate">{p.title || p.item_id}</p>
                <p className="text-[10px] text-navy-muted group-hover:text-white/70">{p.item_id}</p>
              </td>
              <td className="px-3 py-2.5 text-right font-semibold text-warning group-hover:text-white">{fNum(p.clicks)}</td>
              <td className="px-3 py-2.5 text-right text-danger group-hover:text-white">{fPct(p.cvr)}</td>
              <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{fEur(p.cost)}</td>
              <td className="px-3 py-2.5 text-navy-muted group-hover:text-white/80 text-[11px]">{getSuggestedAction(p)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 7 : Comparison ───────────────────────────────

function ComparisonTable({ data, isLoading, trendFilter, onTrendFilter }) {
  if (isLoading) return <Skeleton rows={8} />;

  const filtered = (data || []).filter(p => trendFilter === 'ALL' || p.trend === trendFilter).slice(0, 200);
  if (!filtered.length) return <EmptyState />;

  return (
    <div>
      <div className="flex gap-1 mb-4">
        {TREND_OPTIONS.map(opt => (
          <button key={opt.key} onClick={() => onTrendFilter(opt.key)}
            className={`px-2.5 py-1 text-xs font-medium rounded-inner transition-colors ${trendFilter === opt.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy hover:bg-bg-page'}`}>
            {opt.label}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto max-h-[520px] overflow-y-auto rounded-inner border border-border">
        <table className="w-full text-[12px]">
          <thead className="sticky top-0 z-10">
            <tr className="bg-bg-page border-b-2 border-border">
              <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Produit</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Rev. actuel</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Rev. préc.</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Δ Revenue</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">ROAS act.</th>
              <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Δ ROAS</th>
              <th className="px-3 py-3 text-center text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Trend</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr key={`${p.brand}|${p.market}|${p.item_id}`}
                className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                <td className="px-3 py-2.5 max-w-[260px]">
                  <p className="text-navy font-medium group-hover:text-white truncate">{p.title || p.item_id}</p>
                  <p className="text-[10px] text-navy-muted group-hover:text-white/70">{p.product_brand} · {p.market}</p>
                </td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{p.current ? fEur(p.current.revenue) : '—'}</td>
                <td className="px-3 py-2.5 text-right text-navy-muted group-hover:text-white/70">{p.previous ? fEur(p.previous.revenue) : '—'}</td>
                <td className="px-3 py-2.5 text-right"><DeltaBadge v={p.delta_revenue} suffix="%" /></td>
                <td className="px-3 py-2.5 text-right text-navy group-hover:text-white">{p.current ? fROASx(p.current.roas) : '—'}</td>
                <td className="px-3 py-2.5 text-right"><DeltaBadge v={p.delta_roas} suffix="" /></td>
                <td className="px-3 py-2.5 text-center">
                  {p.trend === 'UP'   && <span className="text-[10px] font-semibold text-success bg-success-bg px-1.5 py-0.5 rounded">↑ Hausse</span>}
                  {p.trend === 'DOWN' && <span className="text-[10px] font-semibold text-danger bg-danger-bg px-1.5 py-0.5 rounded">↓ Baisse</span>}
                  {p.trend === 'NEW'  && <span className="text-[10px] font-semibold text-[#1565C0] bg-[#E3F2FD] px-1.5 py-0.5 rounded">✦ Nouveau</span>}
                  {p.trend === 'GONE' && <span className="text-[10px] font-semibold text-navy-muted bg-bg-page px-1.5 py-0.5 rounded">✕ Disparu</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────

export default function ShoppingView() {
  const [brand, setBrand]       = useState('COCOONCENTER');
  const [market, setMarket]     = useState('ALL');
  const [preset, setPreset]     = useState('30j');
  const [fromDate, setFromDate] = useState(() => subDays(30));
  const [toDate, setToDate]     = useState(() => today());
  const [compareTo, setCompareTo] = useState('previous_period');

  // Product table filters
  const [activeSegment, setActiveSegment]   = useState('ALL');
  const [priceStatusFilter, setPriceStatus] = useState('ALL');
  const [prodBrand, setProdBrand]           = useState('ALL');
  const [search, setSearch]                 = useState('');
  const [sortKey, setSortKey]               = useState('revenue');
  const [order, setOrder]                 = useState('desc');
  const [offset, setOffset]               = useState(0);

  // UI state
  const [showAllBrands, setShowAllBrands] = useState(false);
  const [trendFilter, setTrendFilter]     = useState('ALL');

  function handlePreset(p) {
    const range = getPreset(p);
    setPreset(p);
    setFromDate(range.from);
    setToDate(range.to);
    setOffset(0);
  }

  function handleSegment(seg) {
    setActiveSegment(seg);
    setOffset(0);
  }

  function handlePriceStatus(s) {
    setPriceStatus(s);
    setOffset(0);
  }

  function handleSort(col) {
    if (sortKey === col) setOrder(o => o === 'desc' ? 'asc' : 'desc');
    else { setSortKey(col); setOrder('desc'); }
    setOffset(0);
  }

  const baseParams = { brand, market, from: fromDate, to: toDate };

  const { data: priceSummary, isLoading: priceLoading } = useQuery({
    queryKey: ['shopping-price-summary', brand, market, fromDate, toDate],
    queryFn: () => fetchApi('/api/shopping/price-summary', baseParams),
    staleTime: 15 * 60 * 1000,
  });

  const { data: productsData, isLoading: prodLoading } = useQuery({
    queryKey: ['shopping-products', brand, market, fromDate, toDate, activeSegment, priceStatusFilter, prodBrand, search, sortKey, order, offset],
    queryFn: () => fetchApi('/api/shopping/products', {
      ...baseParams,
      segment: activeSegment, price_status: priceStatusFilter,
      product_brand: prodBrand, search,
      sort: sortKey, order, limit: 50, offset,
    }),
    staleTime: 5 * 60 * 1000,
    placeholderData: prev => prev,
  });

  const { data: brandsData, isLoading: brandsLoading } = useQuery({
    queryKey: ['shopping-brands', brand, market, fromDate, toDate],
    queryFn: () => fetchApi('/api/shopping/brands', baseParams),
    staleTime: 5 * 60 * 1000,
  });

  const { data: compData, isLoading: compLoading } = useQuery({
    queryKey: ['shopping-comparison', brand, market, fromDate, toDate, compareTo],
    queryFn: () => fetchApi('/api/shopping/comparison', { ...baseParams, compareTo }),
    staleTime: 5 * 60 * 1000,
  });

  const { data: zombiesData, isLoading: zombiesLoading } = useQuery({
    queryKey: ['shopping-zombies', brand, market, fromDate, toDate],
    queryFn: () => fetchApi('/api/shopping/zombies', baseParams),
    staleTime: 5 * 60 * 1000,
  });

  const { data: lowCvrData, isLoading: lowCvrLoading } = useQuery({
    queryKey: ['shopping-lowcvr', brand, market, fromDate, toDate],
    queryFn: () => fetchApi('/api/shopping/products', {
      ...baseParams,
      segment: 'TRAFIC_SANS_CONV', sort: 'clicks', order: 'desc', limit: 500, offset: 0,
    }),
    staleTime: 5 * 60 * 1000,
  });

  // Build product brand options from brands data
  const brandOptions = useMemo(() => {
    if (!brandsData) return [];
    return brandsData.slice(0, 30).map(b => b.product_brand);
  }, [brandsData]);

  const summary = productsData?.summary;

  return (
    <div className="space-y-5">
      {/* ── Header controls ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-lg font-semibold text-navy">Shopping</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={brand} onChange={e => setBrand(e.target.value)}
            className="bg-white border border-border rounded-inner px-3 py-2 text-xs text-navy font-medium focus:border-navy outline-none shadow-card">
            {BRAND_OPTIONS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <select value={market} onChange={e => setMarket(e.target.value)}
            className="bg-white border border-border rounded-inner px-3 py-2 text-xs text-navy font-medium focus:border-navy outline-none shadow-card">
            <option value="ALL">Tous les marchés</option>
            <option value="FR">France</option>
            <option value="DE">Allemagne</option>
            <option value="ES">Espagne</option>
            <option value="IT">Italie</option>
            <option value="UK">Royaume-Uni</option>
            <option value="BE">Belgique</option>
            <option value="NL">Pays-Bas</option>
            <option value="PL">Pologne</option>
            <option value="US">États-Unis</option>
          </select>
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {PRESETS.map(p => (
              <button key={p} onClick={() => handlePreset(p)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${preset === p ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                {p}
              </button>
            ))}
          </div>
          <input type="date" value={fromDate} onChange={e => { setFromDate(e.target.value); setPreset('custom'); }}
            className="bg-white text-navy text-xs px-2 py-1.5 rounded-inner border border-border focus:border-navy outline-none" />
          <span className="text-navy-muted text-xs">–</span>
          <input type="date" value={toDate} onChange={e => { setToDate(e.target.value); setPreset('custom'); }}
            className="bg-white text-navy text-xs px-2 py-1.5 rounded-inner border border-border focus:border-navy outline-none" />
          <div className="flex bg-bg-page rounded-inner p-0.5">
            {COMPARE_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => setCompareTo(opt.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${compareTo === opt.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Section 1 : KPIs ── */}
      <KpiCards summary={summary} prevSummary={null} />

      {/* ── Price competitiveness scorecards ── */}
      <SectionCard title="Compétitivité prix vs marché">
        <PriceScoreCards
          priceSummary={priceSummary}
          isLoading={priceLoading}
          activeStatus={priceStatusFilter}
          onStatusChange={handlePriceStatus}
        />
      </SectionCard>

      {/* ── Section 2 : Segments ── */}
      <SegmentBadges
        segments={productsData?.segments}
        segmentRevenue={productsData?.segment_revenue}
        totalRevenue={summary?.revenue || 0}
        activeSegment={activeSegment}
        onSegmentChange={handleSegment}
      />

      {/* ── Section 3 : Brands ── */}
      <SectionCard title="Top marques produits">
        <BrandsTable
          brands={brandsData}
          isLoading={brandsLoading}
          showAll={showAllBrands}
          onToggleAll={() => setShowAllBrands(v => !v)}
        />
      </SectionCard>

      {/* ── Section 4 : Products ── */}
      <SectionCard title="Top produits">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <input
            type="text" placeholder="Rechercher un produit..." value={search}
            onChange={e => { setSearch(e.target.value); setOffset(0); }}
            className="bg-bg-page border border-border rounded-inner px-3 py-1.5 text-xs text-navy placeholder-navy-muted focus:border-navy outline-none w-52"
          />
          <select value={prodBrand} onChange={e => { setProdBrand(e.target.value); setOffset(0); }}
            className="bg-white border border-border rounded-inner px-3 py-1.5 text-xs text-navy font-medium focus:border-navy outline-none">
            <option value="ALL">Toutes les marques produit</option>
            {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <div className="flex gap-1 ml-auto">
            {PRICE_STATUS_OPTIONS.map(opt => (
              <button key={opt.key} onClick={() => handlePriceStatus(priceStatusFilter === opt.key ? 'ALL' : opt.key)}
                className={`px-2.5 py-1 text-[11px] font-medium rounded-inner border transition-colors ${priceStatusFilter === opt.key ? opt.cls + ' border-current' : 'bg-white border-border text-navy-muted hover:text-navy'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <ProductsTable
          data={productsData}
          isLoading={prodLoading}
          totalFiltered={productsData?.total_filtered}
          offset={offset}
          onOffset={setOffset}
          sortKey={sortKey}
          order={order}
          onSort={handleSort}
          brandOptions={brandOptions}
        />
      </SectionCard>

      {/* ── Section 5 : Zombies ── */}
      <SectionCard title={`Produits zombies${zombiesData ? ` (${zombiesData.length})` : ''}`} collapsible defaultOpen={false}>
        <p className="text-xs text-navy-muted mb-4 bg-warning-bg border border-warning/20 rounded-inner px-3 py-2">
          Ces produits étaient actifs dans les 90 derniers jours mais n'ont reçu aucune impression sur la période sélectionnée.
          Causes possibles : prix non compétitif, produit désapprouvé dans MC, exclusion de groupe de produits.
        </p>
        {zombiesLoading ? <Skeleton rows={5} /> : !zombiesData?.length ? <EmptyState msg="Aucun produit zombie détecté" /> : (
          <div className="overflow-x-auto max-h-[400px] overflow-y-auto rounded-inner border border-border">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-bg-page border-b-2 border-border">
                  <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Produit</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Marque</th>
                  <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Marché</th>
                </tr>
              </thead>
              <tbody>
                {zombiesData.slice(0, 100).map((p, i) => (
                  <tr key={`${p.market}|${p.item_id}`} className={`border-b border-border ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                    <td className="px-3 py-2.5 max-w-[300px]">
                      <p className="text-navy font-medium truncate">{p.title || p.item_id}</p>
                      <p className="text-[10px] text-navy-muted">{p.item_id}</p>
                    </td>
                    <td className="px-3 py-2.5 text-navy-muted text-[11px]">{p.brand || '—'}</td>
                    <td className="px-3 py-2.5 text-navy-muted text-[11px]">{p.market}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {zombiesData.length > 100 && (
              <p className="text-xs text-navy-muted mt-3 text-center">... et {zombiesData.length - 100} autres produits</p>
            )}
          </div>
        )}
      </SectionCard>

      {/* ── Section 6 : Low CVR ── */}
      <SectionCard title={`Produits fort trafic / CVR faible${lowCvrData ? ` (${lowCvrData.total_filtered || 0})` : ''}`} collapsible defaultOpen={false}>
        <p className="text-xs text-navy-muted mb-4">Produits avec plus de 50 clics et un taux de conversion inférieur à 1%.</p>
        <LowCvrTable
          products={lowCvrData?.products}
          isLoading={lowCvrLoading}
        />
      </SectionCard>

      {/* ── Price insights ── */}
      {priceSummary?.insights?.length > 0 && (
        <SectionCard title="Produits les plus chers vs concurrents" collapsible defaultOpen={false}>
          <p className="text-xs text-navy-muted mb-4">Top 10 produits actifs avec le prix le plus élevé par rapport au marché.</p>
          <div className="overflow-x-auto rounded-inner border border-border">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-bg-page border-b-2 border-border">
                  <th className="px-3 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Produit</th>
                  <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Notre prix</th>
                  <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Prix marché</th>
                  <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Écart</th>
                  <th className="px-3 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {priceSummary.insights.map((p, i) => (
                  <tr key={p.item_id} className={`border-b border-border ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                    <td className="px-3 py-2.5 max-w-[280px]">
                      <p className="text-navy font-medium truncate">{p.title || p.item_id}</p>
                      <p className="text-[10px] text-navy-muted">{p.product_brand} · {p.item_id}</p>
                    </td>
                    <td className="px-3 py-2.5 text-right text-navy">{fEur(p.our_price)}</td>
                    <td className="px-3 py-2.5 text-right text-navy-muted">{fEur(p.benchmark_price)}</td>
                    <td className="px-3 py-2.5 text-right">
                      <span className="text-xs font-semibold text-danger">+{p.delta_pct?.toFixed(1)}%</span>
                    </td>
                    <td className="px-3 py-2.5 text-right text-navy">{fEur(p.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </SectionCard>
      )}

      {/* ── Section 7 : Comparison ── */}
      <SectionCard title="Comparaison période">
        <ComparisonTable
          data={compData}
          isLoading={compLoading}
          trendFilter={trendFilter}
          onTrendFilter={setTrendFilter}
        />
      </SectionCard>
    </div>
  );
}
