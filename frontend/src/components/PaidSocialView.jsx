import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  BarChart,
  LabelList,
} from 'recharts';
import { fetchApi } from '../utils/api';
import {
  fEur,
  fNum,
  fPct,
  fROAS,
  fDelta,
  fCompact,
  fEurCompact,
} from '../utils/formatters';
import { CHART } from '../utils/chartColors';
import AccordionSection from './AccordionSection';

// Phase 1 hard scope. The toggle exposes TikTok / Combiné as locked tabs but
// only Meta is wired. Backend returns empty rows for the others.
const PLATFORMS = [
  { key: 'meta',   label: 'Meta',    enabled: true,  badge: null },
  { key: 'tiktok', label: 'TikTok',  enabled: false, badge: 'À venir' },
  { key: 'all',    label: 'Combiné', enabled: false, badge: 'À venir' },
];

// Phase 1 — Meta Ads is only configured on Brand Alpha. Other brands fall
// back to this when selected in the header.
const META_BRAND = 'BRAND_A';
const META_DEFAULT_MARKET = 'FR';
// Refined at runtime via /api/paid-social/status, but we hardcode a fallback
// so the first render doesn't bounce the market selection while the status
// query is in flight.
const META_SUPPORTED_MARKETS_FALLBACK = ['FR', 'UK', 'DE', 'ES', 'IT'];

function resolveMetaScope(filters, supportedMarkets) {
  const requestedMarket = filters?.market && filters.market !== 'ALL' ? filters.market : META_DEFAULT_MARKET;
  const isSupported = supportedMarkets.includes(requestedMarket);
  const market = isSupported ? requestedMarket : META_DEFAULT_MARKET;
  return {
    brand: META_BRAND,
    market,
    requestedMarket: filters?.market || META_DEFAULT_MARKET,
    fellBack: !isSupported,
  };
}

// ─── KPI scorecards ───────────────────────────────────────

const KPI_CONFIG = [
  { key: 'impressions', label: 'IMPRESSIONS', format: fCompact,                                   deltaKey: 'impressions_pct', accent: '#A78BFA' },
  { key: 'clicks',      label: 'CLICS',       format: fCompact,                                   deltaKey: 'clicks_pct',      accent: '#60A5FA' },
  { key: 'ctr',         label: 'CTR',         format: (v) => (v != null ? v.toFixed(2) + '%' : '—'), deltaKey: 'ctr_pct', accent: '#D4537E' },
  { key: 'cost',        label: 'COÛT',        format: fEurCompact,                                deltaKey: 'cost_pct',        accent: '#378ADD', neutral: true },
  { key: 'cpc',         label: 'CPC',         format: (v) => fEur(v, true),                       deltaKey: 'cpc_pct',         accent: '#F59E0B', invert: true },
  { key: 'conversions', label: 'CONVERSIONS', format: fCompact,                                   deltaKey: 'conversions_pct', accent: CHART.warning },
  { key: 'revenue',     label: 'REVENUE',     format: fEurCompact,                                deltaKey: 'revenue_pct',     accent: '#00E89A' },
  { key: 'roas',        label: 'ROAS',        format: fROAS,                                       deltaKey: 'roas_pct',        accent: CHART.success },
];

function MetaBadge() {
  return (
    <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-[#1877F2]/10 text-[#1877F2]">
      Meta Ads
    </span>
  );
}

function KpiScorecards({ data, isLoading }) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-4 lg:grid-cols-8 gap-4">
        {KPI_CONFIG.map((k) => (
          <div key={k.key} className="bg-white rounded-card p-5 border border-border shadow-card">
            <div className="skeleton h-2.5 w-12 mb-3" />
            <div className="skeleton h-7 w-24 mb-2" />
            <div className="skeleton h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const { current = {}, previous = {}, deltas = {} } = data;

  return (
    <div className="grid grid-cols-4 lg:grid-cols-8 gap-4">
      {KPI_CONFIG.map((kpi) => {
        const value = current[kpi.key];
        const prevValue = previous[kpi.key];
        const delta = deltas[kpi.deltaKey];
        const isPositive = delta > 0;
        const isNegative = delta < 0;

        let deltaColor = 'text-navy-muted';
        if (!kpi.neutral) {
          if (kpi.invert) {
            deltaColor = isPositive ? 'text-danger' : isNegative ? 'text-success' : 'text-navy-muted';
          } else {
            deltaColor = isPositive ? 'text-success' : isNegative ? 'text-danger' : 'text-navy-muted';
          }
        }

        const arrow = isPositive ? '▲' : isNegative ? '▼' : '';
        const deltaText = `${arrow} ${fDelta(delta, 'pct')}`;

        return (
          <div key={kpi.key} className="bg-white rounded-card border border-border shadow-card overflow-hidden">
            <div className="h-[3px]" style={{ background: kpi.accent }} />
            <div className="px-4 py-3.5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-navy-muted text-[10px] font-medium uppercase tracking-[0.06em]">
                  {kpi.label}
                </p>
                <MetaBadge />
              </div>
              <p className="text-[22px] font-bold text-navy leading-tight mb-2">{kpi.format(value)}</p>
              <p className={`text-[11px] font-medium ${deltaColor} mb-0.5`}>
                {deltaText}{' '}
                <span className="text-navy-muted font-normal text-[10px]">vs période</span>
              </p>
              <p className="text-navy-muted text-[10px]">{kpi.format(prevValue)}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Trend chart ──────────────────────────────────────────

const TREND_KPIS = [
  { value: 'roas',        label: 'ROAS',        format: (v) => (v != null ? v.toFixed(2) + '×' : '—'),  axisFormat: (v) => v?.toFixed(1) + '×' },
  { value: 'cpc',         label: 'CPC',         format: (v) => fEur(v, true),                            axisFormat: (v) => v?.toFixed(2) + ' €' },
  { value: 'ctr',         label: 'CTR',         format: (v) => (v != null ? v.toFixed(2) + '%' : '—'), axisFormat: (v) => v?.toFixed(1) + '%' },
  { value: 'clicks',      label: 'Clics',       format: fNum,                                            axisFormat: fCompact },
  { value: 'conversions', label: 'Conversions', format: fNum,                                            axisFormat: fCompact },
  { value: 'revenue',     label: 'Revenue',     format: fEur,                                            axisFormat: fEurCompact },
];

const GRANULARITIES = [
  { value: 'day',   label: 'Jour' },
  { value: 'week',  label: 'Semaine' },
  { value: 'month', label: 'Mois' },
];

function TrendTooltip({ active, payload, label, kpiOption }) {
  if (!active || !payload?.length) return null;
  const cost = payload.find((p) => p.dataKey === 'cost')?.value;
  const kpiVal = payload.find((p) => p.dataKey === kpiOption?.value)?.value;
  return (
    <div className="bg-white border border-border rounded-xl px-4 py-3 shadow-lg text-[12px] min-w-[160px]">
      <p className="font-semibold text-navy mb-2 text-[13px]">{label}</p>
      <p className="flex justify-between gap-4">
        <span className="text-navy-muted">Coût</span>
        <span className="font-medium text-navy">{fEur(cost)}</span>
      </p>
      <p className="flex justify-between gap-4">
        <span className="text-navy-muted">{kpiOption?.label}</span>
        <span className="font-medium" style={{ color: '#1877F2' }}>
          {kpiOption?.format(kpiVal)}
        </span>
      </p>
    </div>
  );
}

function TrendChart({ filters, platform, scope }) {
  const [selectedKpi, setSelectedKpi] = useState('roas');
  const [granularity, setGranularity] = useState('day');

  const { data, isLoading } = useQuery({
    queryKey: ['paid-social', 'trend', platform, scope.brand, scope.market, filters.from, filters.to, granularity],
    queryFn: () => fetchApi('/api/paid-social/trend', {
      platform,
      brand: scope.brand,
      market: scope.market,
      from: filters.from,
      to: filters.to,
      granularity,
    }),
    enabled: !!filters.from && !!filters.to,
    placeholderData: (prev) => prev,
  });

  const kpiOption = useMemo(
    () => TREND_KPIS.find((k) => k.value === selectedKpi) || TREND_KPIS[0],
    [selectedKpi],
  );
  const series = data?.series || [];

  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-navy">Coût & Performance</h3>
          <div className="flex gap-0.5 bg-bg-page rounded-lg p-0.5">
            {GRANULARITIES.map((g) => (
              <button
                key={g.value}
                onClick={() => setGranularity(g.value)}
                className={`px-3 py-1 text-[12px] font-medium rounded-md transition-colors ${
                  granularity === g.value ? 'bg-white text-navy shadow-sm' : 'text-navy-muted hover:text-navy'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[12px] text-navy-muted">Coût +</span>
          <select
            value={selectedKpi}
            onChange={(e) => setSelectedKpi(e.target.value)}
            className="text-[13px] font-medium border border-border rounded-lg px-3 py-1.5 pr-8 bg-white focus:outline-none focus:ring-2 focus:ring-navy/20 cursor-pointer"
            style={{ color: '#1877F2', borderColor: '#1877F233' }}
          >
            {TREND_KPIS.map((k) => (
              <option key={k.value} value={k.value} style={{ color: CHART.navy }}>
                {k.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading && !series.length ? (
        <div className="skeleton h-72 w-full" />
      ) : series.length ? (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={series} margin={{ top: 5, right: 55, bottom: 5, left: 55 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(26,46,74,0.07)" vertical={false} />
            <XAxis dataKey="date" tick={{ fill: CHART.navyMuted, fontSize: 10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis yAxisId="left" tick={{ fill: CHART.navyMuted, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={fEurCompact} width={52} />
            <YAxis yAxisId="right" orientation="right" tick={{ fill: CHART.navyMuted, fontSize: 10 }} tickLine={false} axisLine={false} tickFormatter={kpiOption.axisFormat} width={52} />
            <Tooltip content={<TrendTooltip kpiOption={kpiOption} />} cursor={{ fill: 'rgba(26,46,74,0.04)' }} />
            <Bar yAxisId="left" dataKey="cost" name="Coût" fill={CHART.navy} radius={[3, 3, 0, 0]} maxBarSize={36} />
            <Line yAxisId="right" type="monotone" dataKey={selectedKpi} name={kpiOption.label} stroke="#1877F2" strokeWidth={2.5} dot={false} activeDot={{ r: 4, fill: '#1877F2', stroke: '#fff', strokeWidth: 2 }} />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-72 flex items-center justify-center text-navy-muted text-sm">
          Aucune donnée sur la période.
        </div>
      )}
    </div>
  );
}

// ─── Campaigns table ──────────────────────────────────────

function DeltaCell({ value, invert = false }) {
  if (value == null || isNaN(value)) return <span className="text-navy-muted">—</span>;
  const isPos = value > 0;
  const isNeg = value < 0;
  let cls = 'text-navy-muted';
  if (invert) cls = isPos ? 'text-danger' : isNeg ? 'text-success' : 'text-navy-muted';
  else cls = isPos ? 'text-success' : isNeg ? 'text-danger' : 'text-navy-muted';
  return (
    <span className={`text-[10px] font-medium ${cls}`}>
      {isPos ? '▲' : isNeg ? '▼' : ''} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

// ─── Ad creative drill-down ───────────────────────────────

const FORMAT_BADGE = {
  image:    { label: 'Image',    color: 'bg-blue-50 text-blue-700' },
  video:    { label: 'Vidéo',    color: 'bg-purple-50 text-purple-700' },
  carousel: { label: 'Carousel', color: 'bg-amber-50 text-amber-700' },
  dynamic:  { label: 'Dynamic',  color: 'bg-indigo-50 text-indigo-700' },
  unknown:  { label: '—',        color: 'bg-bg-page text-navy-muted' },
};

const STATUS_DOT = {
  ACTIVE:           { color: 'bg-success', label: 'Active' },
  PAUSED:           { color: 'bg-navy-muted', label: 'En pause' },
  DELETED:          { color: 'bg-danger', label: 'Supprimée' },
  ARCHIVED:         { color: 'bg-navy-muted', label: 'Archivée' },
  DISAPPROVED:      { color: 'bg-danger', label: 'Refusée' },
  PENDING_REVIEW:   { color: 'bg-warning', label: 'En review' },
  WITH_ISSUES:      { color: 'bg-warning', label: 'Issues' },
};

function CreativeThumb({ creative, ad_name, size = 'md' }) {
  const dim = size === 'lg' ? 240 : 132;
  const src = creative?.thumbnail_url || creative?.image_url || creative?.children?.[0]?.image_url;
  const isVideo = creative?.format === 'video';
  const isCarousel = creative?.format === 'carousel';

  if (!src) {
    return (
      <div
        style={{ width: dim, height: dim }}
        className="bg-bg-page border border-border rounded-card flex items-center justify-center text-navy-muted text-[10px]"
      >
        Pas d&apos;aperçu
      </div>
    );
  }

  return (
    <div className="relative" style={{ width: dim, height: dim }}>
      <img
        src={src}
        alt={ad_name || 'creative'}
        className="w-full h-full object-cover rounded-card border border-border bg-bg-page"
        loading="lazy"
        onError={(e) => { e.currentTarget.style.opacity = 0.3; }}
      />
      {isVideo && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-10 h-10 bg-black/55 rounded-full flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}
      {isCarousel && creative?.children?.length > 1 && (
        <div className="absolute top-1.5 right-1.5 bg-black/60 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
          {creative.children.length} ▸
        </div>
      )}
    </div>
  );
}

function MetricChip({ label, value, valueClass = 'text-navy' }) {
  return (
    <div className="flex flex-col items-start">
      <span className="text-[8px] font-bold uppercase tracking-wider text-navy-muted/80 leading-none">{label}</span>
      <span className={`text-[12px] font-semibold tabular-nums leading-tight ${valueClass}`}>{value}</span>
    </div>
  );
}

// Strip protocol + trailing slash, keep query/path so the user can preview
// the campaign tracking parameters at a glance without overflowing the card.
function shortDisplayUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/\/$/, '');
    return u.host + path + (u.search ? u.search : '');
  } catch {
    return url;
  }
}

function AdCard({ ad, onClick }) {
  const status = ad.effective_status;
  const dot = STATUS_DOT[status] || { color: 'bg-navy-muted', label: status || '—' };
  const fmt = FORMAT_BADGE[ad.creative?.format || 'unknown'];
  const roasClass = ad.roas >= 3 ? 'text-success' : ad.roas >= 1.5 ? 'text-warning' : 'text-danger';
  const linkUrl = ad.creative?.link_url;
  const display = shortDisplayUrl(linkUrl);

  // Card-as-div (not button) so we can nest a real <a> for the destination
  // URL — `<a>` inside `<button>` is invalid HTML and breaks click targeting.
  // Manual role+keyboard plumbing keeps the whole card clickable for the modal.
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }
      }}
      className="cursor-pointer text-left bg-white border border-border rounded-card overflow-hidden shadow-sm hover:shadow-md hover:border-navy/30 transition-all flex flex-col focus:outline-none focus:ring-2 focus:ring-navy/30"
    >
      <div className="p-3 flex gap-3">
        <CreativeThumb creative={ad.creative} ad_name={ad.ad_name} size="md" />
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className={`text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded ${fmt.color}`}>{fmt.label}</span>
            <span className="flex items-center gap-1 text-[9px] text-navy-muted whitespace-nowrap">
              <span className={`w-1.5 h-1.5 rounded-full ${dot.color}`} /> {dot.label}
            </span>
          </div>
          {ad.creative?.title && (
            <p className="text-[12px] font-semibold text-navy line-clamp-2 leading-snug mb-1" title={ad.creative.title}>
              {ad.creative.title}
            </p>
          )}
          {ad.creative?.body && (
            <p className="text-[11px] text-navy-muted line-clamp-3 leading-snug" title={ad.creative.body}>
              {ad.creative.body}
            </p>
          )}
          {linkUrl && (
            <a
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              title={linkUrl}
              className="mt-1 inline-flex items-center gap-1 text-[10px] text-blue-600 hover:underline truncate max-w-full"
            >
              <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 3h7v7M10 14L21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
              </svg>
              <span className="truncate">{display}</span>
            </a>
          )}
          <p className="text-[10px] text-navy-muted/70 mt-auto pt-1 truncate" title={ad.ad_name}>
            {ad.ad_name}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2 px-3 py-2 bg-bg-page border-t border-border">
        <MetricChip label="Impr"  value={fCompact(ad.impressions)} />
        <MetricChip label="CTR"   value={ad.ctr.toFixed(2) + '%'} />
        <MetricChip label="Coût"  value={fEur(ad.cost)} />
        <MetricChip label="ROAS"  value={fROAS(ad.roas)} valueClass={`font-bold ${roasClass}`} />
      </div>
    </div>
  );
}

function CreativeModal({ ad, onClose }) {
  if (!ad) return null;
  const status = ad.effective_status;
  const dot = STATUS_DOT[status] || { color: 'bg-navy-muted', label: status || '—' };
  const fmt = FORMAT_BADGE[ad.creative?.format || 'unknown'];

  // Direct deep-link to the ad in Meta Ads Manager
  const adsManagerUrl = `https://business.facebook.com/adsmanager/manage/ads/edit?act=${ad.ad_id ? '' : ''}&selected_ad_ids=${ad.ad_id}`;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div
        className="bg-white rounded-card shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded ${fmt.color}`}>{fmt.label}</span>
            <span className="flex items-center gap-1.5 text-[11px] text-navy-muted">
              <span className={`w-2 h-2 rounded-full ${dot.color}`} /> {dot.label}
            </span>
            {ad.created_time && (
              <span className="text-[11px] text-navy-muted">
                · Créée le {new Date(ad.created_time).toLocaleDateString('fr-FR')}
              </span>
            )}
          </div>
          <button onClick={onClose} className="text-navy-muted hover:text-navy text-2xl leading-none">×</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-6">
          <div>
            <CreativeThumb creative={ad.creative} ad_name={ad.ad_name} size="lg" />
            {ad.creative?.children?.length > 1 && (
              <div className="mt-3 grid grid-cols-4 gap-2">
                {ad.creative.children.map((ch, i) => (
                  ch.image_url && (
                    <img key={i} src={ch.image_url} alt={ch.title || ''} className="w-full aspect-square object-cover rounded border border-border" loading="lazy" />
                  )
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-navy-muted mb-1">Nom de l&apos;ad</p>
              <p className="text-[13px] text-navy">{ad.ad_name}</p>
            </div>
            {ad.creative?.title && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-navy-muted mb-1">Titre</p>
                <p className="text-[14px] font-semibold text-navy">{ad.creative.title}</p>
              </div>
            )}
            {ad.creative?.body && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-navy-muted mb-1">Texte</p>
                <p className="text-[12px] text-navy whitespace-pre-line">{ad.creative.body}</p>
              </div>
            )}
            {ad.creative?.cta_type && (
              <div className="inline-flex">
                <span className="text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-inner bg-[#1877F2] text-white">
                  {ad.creative.cta_type.replace(/_/g, ' ')}
                </span>
              </div>
            )}
            {ad.creative?.link_url && (
              <a href={ad.creative.link_url} target="_blank" rel="noopener noreferrer"
                 className="text-[11px] text-blue-600 hover:underline truncate" title={ad.creative.link_url}>
                {ad.creative.link_url} ↗
              </a>
            )}
          </div>
        </div>

        <div className="px-6 pb-6">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy-muted mb-2">Performance sur la période</p>
          <div className="grid grid-cols-4 md:grid-cols-8 gap-3 bg-bg-page rounded-card p-4 border border-border">
            <MetricChip label="Impr"        value={fCompact(ad.impressions)} />
            <MetricChip label="Clics"       value={fCompact(ad.clicks)} />
            <MetricChip label="CTR"         value={ad.ctr.toFixed(2) + '%'} />
            <MetricChip label="Coût"        value={fEur(ad.cost)} />
            <MetricChip label="CPC"         value={fEur(ad.cpc, true)} />
            <MetricChip label="Conv."       value={fNum(ad.conversions)} />
            <MetricChip label="Revenue"     value={fEur(ad.revenue)} />
            <MetricChip label="ROAS"        value={fROAS(ad.roas)}
              valueClass={`font-bold ${ad.roas >= 3 ? 'text-success' : ad.roas >= 1.5 ? 'text-warning' : 'text-danger'}`} />
          </div>
        </div>

        <div className="flex justify-between items-center px-6 py-3 border-t border-border bg-bg-page">
          <span className="text-[10px] text-navy-muted font-mono">ad_id: {ad.ad_id}</span>
          <a href={adsManagerUrl} target="_blank" rel="noopener noreferrer"
             className="text-[11px] font-medium px-3 py-1.5 rounded-inner bg-navy text-white hover:bg-navy-light">
            Ouvrir dans Ads Manager ↗
          </a>
        </div>
      </div>
    </div>
  );
}

function AdGallery({ filters, platform, scope, campaignId, status, onPickAd }) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['paid-social', 'ads', platform, scope.brand, scope.market, campaignId, filters.from, filters.to, filters.compareTo, status],
    queryFn: () => fetchApi('/api/paid-social/ads', {
      platform,
      brand: scope.brand,
      market: scope.market,
      campaign_id: campaignId,
      from: filters.from,
      to: filters.to,
      compareTo: filters.compareTo,
      status,
    }),
    enabled: !!campaignId && !!filters.from,
    placeholderData: (prev) => prev,
  });

  if (isLoading && !data) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-44 bg-white rounded-card border border-border animate-pulse" />
        ))}
      </div>
    );
  }
  if (isError) {
    return <div className="text-danger text-xs py-4">Erreur : {error?.message || 'chargement échoué'}</div>;
  }
  const ads = data?.ads || [];
  if (!ads.length) {
    return <div className="text-navy-muted text-xs italic py-6 text-center">Aucune ad trouvée pour cette campagne avec ce filtre.</div>;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {ads.map(ad => (
        <AdCard key={ad.ad_id} ad={ad} onClick={() => onPickAd(ad)} />
      ))}
    </div>
  );
}

function CampaignsTable({ filters, platform, scope }) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('cost');
  const [sortDir, setSortDir] = useState('desc');
  const [expandedId, setExpandedId] = useState(null);
  const [modalAd, setModalAd] = useState(null);
  const [adStatusFilter, setAdStatusFilter] = useState('active'); // active | all | paused

  const { data, isLoading } = useQuery({
    queryKey: ['paid-social', 'campaigns', platform, scope.brand, scope.market, filters.from, filters.to, filters.compareTo],
    queryFn: () => fetchApi('/api/paid-social/campaigns', {
      platform,
      brand: scope.brand,
      market: scope.market,
      from: filters.from,
      to: filters.to,
      compareTo: filters.compareTo,
    }),
    enabled: !!filters.from && !!filters.to,
    placeholderData: (prev) => prev,
  });

  const rows = useMemo(() => {
    let r = data?.campaigns || [];
    if (search) {
      const s = search.toLowerCase();
      r = r.filter((c) => c.campaign_name?.toLowerCase().includes(s));
    }
    r = [...r].sort((a, b) => {
      const av = a[sortKey] ?? 0;
      const bv = b[sortKey] ?? 0;
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : av - bv;
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return r;
  }, [data, search, sortKey, sortDir]);

  function handleSort(k) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  }

  const COLS = [
    { key: 'campaign_name', label: 'Campagne',    align: 'left'  },
    { key: 'impressions',   label: 'Impr.',       align: 'right' },
    { key: 'clicks',        label: 'Clics',       align: 'right' },
    { key: 'ctr',           label: 'CTR',         align: 'right' },
    { key: 'cost',          label: 'Coût',        align: 'right' },
    { key: 'cpc',           label: 'CPC',         align: 'right' },
    { key: 'conversions',   label: 'Conv.',       align: 'right' },
    { key: 'revenue',       label: 'Revenue',     align: 'right' },
    { key: 'cvr',           label: 'CVR',         align: 'right' },
    { key: 'aov',           label: 'AOV',         align: 'right' },
    { key: 'roas',          label: 'ROAS',        align: 'right' },
  ];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          placeholder="Rechercher une campagne…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-64 px-3 py-1.5 text-[12px] border border-border rounded-inner focus:outline-none focus:border-navy/50 bg-white"
        />
        <span className="text-[11px] text-navy-muted">
          {isLoading ? 'Chargement…' : `${rows.length} campagne${rows.length > 1 ? 's' : ''}`}
        </span>
      </div>

      <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm">
        <div className="overflow-x-auto overflow-y-auto max-h-[560px]">
          <table className="w-full text-[11px] text-navy border-collapse">
            <thead className="sticky top-0 z-10 bg-white">
              <tr className="bg-bg-page border-b border-border">
                {COLS.map((c) => (
                  <th
                    key={c.key}
                    onClick={() => handleSort(c.key)}
                    className={`px-3 py-2 text-${c.align} text-[10px] font-bold text-navy-muted uppercase tracking-wider cursor-pointer hover:text-navy select-none`}
                  >
                    {c.label}
                    {sortKey === c.key && <span className="ml-1">{sortDir === 'asc' ? '▲' : '▼'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading && !rows.length ? (
                <tr><td colSpan={COLS.length} className="px-4 py-12 text-center text-navy-muted text-xs">Chargement…</td></tr>
              ) : !rows.length ? (
                <tr><td colSpan={COLS.length} className="px-4 py-12 text-center text-navy-muted text-xs italic">Aucune campagne.</td></tr>
              ) : rows.flatMap((r, i) => {
                const isOpen = expandedId === r.campaign_id;
                const baseRow = (
                <tr
                  key={r.campaign_id || i}
                  onClick={() => setExpandedId(isOpen ? null : r.campaign_id)}
                  className={`border-b border-border/50 hover:bg-navy/5 transition-colors cursor-pointer ${i % 2 === 1 ? 'bg-[#FAFBFD]' : 'bg-white'} ${isOpen ? 'bg-navy/5' : ''}`}
                >
                  <td className="px-3 py-2 max-w-[280px]">
                    <div className="flex items-center gap-2">
                      <svg
                        className={`w-3 h-3 text-navy-muted transition-transform flex-shrink-0 ${isOpen ? 'rotate-90' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                      <span className="truncate block font-medium text-navy" title={r.campaign_name}>{r.campaign_name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{fNum(r.impressions)}</span>
                      <DeltaCell value={r.delta_impressions} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{fNum(r.clicks)}</span>
                      <DeltaCell value={r.delta_clicks} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{r.ctr.toFixed(2)}%</span>
                      <DeltaCell value={r.delta_ctr} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span className="font-semibold">{fEur(r.cost)}</span>
                      <DeltaCell value={r.delta_cost} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{fEur(r.cpc, true)}</span>
                      <DeltaCell value={r.delta_cpc} invert />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{fNum(r.conversions)}</span>
                      <DeltaCell value={r.delta_conversions} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span className="font-semibold text-navy">{fEur(r.revenue)}</span>
                      <DeltaCell value={r.delta_revenue} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{fPct(r.cvr)}</span>
                      <DeltaCell value={r.delta_cvr} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{fEur(r.aov)}</span>
                      <DeltaCell value={r.delta_aov} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span className={`font-bold ${r.roas >= 3 ? 'text-success' : r.roas >= 1.5 ? 'text-warning' : 'text-danger'}`}>
                        {fROAS(r.roas)}
                      </span>
                      <DeltaCell value={r.delta_roas} />
                    </div>
                  </td>
                </tr>
                );
                if (!isOpen) return [baseRow];
                const subRow = (
                  <tr key={(r.campaign_id || i) + '-ads'} className="bg-bg-page">
                    <td colSpan={COLS.length} className="p-4 border-b border-border">
                      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-widest text-navy-muted">
                          Créatives — {r.campaign_name}
                        </p>
                        <div className="flex items-center gap-3">
                          <div className="flex gap-0.5 bg-white border border-border rounded-inner p-0.5">
                            {[
                              { key: 'active', label: 'Actives' },
                              { key: 'paused', label: 'En pause' },
                              { key: 'all',    label: 'Toutes' },
                            ].map((opt) => (
                              <button
                                key={opt.key}
                                onClick={(e) => { e.stopPropagation(); setAdStatusFilter(opt.key); }}
                                className={`px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md transition-colors ${
                                  adStatusFilter === opt.key
                                    ? 'bg-navy text-white'
                                    : 'text-navy-muted hover:text-navy'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                          <span className="text-[10px] text-navy-muted">Trié par Impressions ↓ · cliquer une créa pour le détail</span>
                        </div>
                      </div>
                      <AdGallery
                        filters={filters}
                        platform={platform}
                        scope={scope}
                        campaignId={r.campaign_id}
                        status={adStatusFilter}
                        onPickAd={setModalAd}
                      />
                    </td>
                  </tr>
                );
                return [baseRow, subRow];
              })}
            </tbody>
          </table>
        </div>
      </div>
      <CreativeModal ad={modalAd} onClose={() => setModalAd(null)} />
    </div>
  );
}

// ─── Audience analysis ────────────────────────────────────

const BREAKDOWN_TABS = [
  { key: 'placement', label: 'Plateforme' },
  { key: 'device',    label: 'Device' },
  { key: 'age',       label: 'Âge' },
  { key: 'gender',    label: 'Genre' },
];

const DIM_PALETTE = {
  PLATEFORME: '#1877F2',
  DEVICE:     '#7F77DD',
  ÂGE:        '#F59E0B',
  GENRE:      '#D4537E',
};

function GenderLabel(seg) {
  if (seg === 'male')   return 'Homme';
  if (seg === 'female') return 'Femme';
  if (seg === 'unknown') return 'Inconnu';
  return seg;
}
function PrettySegment(dim, seg) {
  if (dim === 'gender' || dim === 'GENRE') return GenderLabel(seg);
  return seg;
}

function roasTone(v) {
  if (v == null || isNaN(v)) return 'text-navy-muted';
  if (v >= 3)   return 'text-success';
  if (v >= 1.5) return 'text-warning';
  return 'text-danger';
}
// ─── Hero: top & flop audiences ───────────────────────────

function WinnersLoserCard({ kind, items, isLoading, threshold }) {
  const isTop = kind === 'top';
  const Icon = isTop ? '🏆' : '🚨';
  const title = isTop ? 'Top audiences' : 'À challenger';
  const headerBg = isTop ? 'bg-success-bg' : 'bg-danger-bg';
  const headerColor = isTop ? 'text-success' : 'text-danger';

  return (
    <div className="bg-white border border-border rounded-card shadow-card overflow-hidden">
      <div className={`${headerBg} border-b border-border px-4 py-2.5 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <span>{Icon}</span>
          <span className={`text-[11px] font-bold uppercase tracking-widest ${headerColor}`}>{title}</span>
        </div>
        <span className="text-[10px] text-navy-muted">spend ≥ {threshold}€</span>
      </div>
      <div className="divide-y divide-border">
        {isLoading ? (
          <div className="px-4 py-10 text-center text-xs text-navy-muted">Chargement…</div>
        ) : !items?.length ? (
          <div className="px-4 py-10 text-center text-xs text-navy-muted italic">Pas assez de spend pour ranker.</div>
        ) : items.map((s, i) => {
          const dimColor = DIM_PALETTE[s.dimension_label] || CHART.navy;
          return (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <span
                className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
                style={{ background: dimColor + '15', color: dimColor }}
              >
                {s.dimension_label}
              </span>
              <span className="font-medium text-navy text-[13px] flex-1 truncate" title={s.segment}>
                {PrettySegment(s.dimension, s.segment)}
              </span>
              <div className="flex flex-col items-end">
                <span className={`font-bold tabular-nums ${roasTone(s.roas)}`}>{fROAS(s.roas)}</span>
                <span className="text-[10px] text-navy-muted tabular-nums">{fEur(s.cost)} · {s.dim_cost_share?.toFixed(0)}% du dim</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WinnersLosersHero({ filters, platform, scope }) {
  const { data, isLoading } = useQuery({
    queryKey: ['paid-social', 'winners-losers', platform, scope.brand, scope.market, filters.from, filters.to],
    queryFn: () => fetchApi('/api/paid-social/audiences/winners-losers', {
      platform,
      brand: scope.brand,
      market: scope.market,
      from: filters.from,
      to: filters.to,
    }),
    enabled: !!filters.from && !!filters.to,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <WinnersLoserCard kind="top"  items={data?.top}  isLoading={isLoading} threshold={data?.min_cost_threshold ?? 50} />
      <WinnersLoserCard kind="flop" items={data?.flop} isLoading={isLoading} threshold={data?.min_cost_threshold ?? 50} />
    </div>
  );
}

// ─── Per-dimension tabs (enriched) ────────────────────────

const DIM_COLORS = ['#1877F2', CHART.success, '#F59E0B', '#D4537E', '#7F77DD', '#60A5FA', '#0EA5E9', '#84CC16', '#F97316'];

function SegmentDonut({ segments }) {
  const slices = segments
    .filter(s => s.cost > 0)
    .map((s, i) => ({ name: PrettySegment(null, s.segment), value: s.cost, color: DIM_COLORS[i % DIM_COLORS.length] }));
  if (!slices.length) return <div className="h-44 flex items-center justify-center text-navy-muted text-xs">—</div>;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={slices} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2} isAnimationActive={false}>
          {slices.map((s, i) => <Cell key={i} fill={s.color} />)}
        </Pie>
        <Tooltip
          formatter={(v, n) => [fEur(v), n]}
          contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #E2E6EF' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function SegmentRoasBar({ segments }) {
  const data = [...segments]
    .filter(s => s.cost > 0)
    .sort((a, b) => b.roas - a.roas)
    .map((s, i) => ({ name: PrettySegment(null, s.segment), roas: s.roas, color: DIM_COLORS[i % DIM_COLORS.length] }));
  if (!data.length) return <div className="h-44 flex items-center justify-center text-navy-muted text-xs">—</div>;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
        <XAxis type="number" tick={{ fontSize: 9 }} tickFormatter={(v) => v + '×'} />
        <YAxis type="category" dataKey="name" tick={{ fontSize: 9 }} width={88} />
        <Tooltip formatter={(v) => [fROAS(v), 'ROAS']} contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #E2E6EF' }} />
        <Bar dataKey="roas" radius={[3, 3, 3, 3]} isAnimationActive={false}>
          {data.map((d, i) => <Cell key={i} fill={d.color} />)}
          <LabelList dataKey="roas" position="right" formatter={(v) => fROAS(v)} style={{ fontSize: 9, fill: '#334155' }} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function BreakdownDetail({ tab, filters, platform, scope }) {
  const { data, isLoading } = useQuery({
    queryKey: ['paid-social', 'breakdown', platform, scope.brand, scope.market, filters.from, filters.to, filters.compareTo, tab],
    queryFn: () => fetchApi('/api/paid-social/breakdown', {
      platform,
      brand: scope.brand,
      market: scope.market,
      from: filters.from,
      to: filters.to,
      compareTo: filters.compareTo,
      dimension: tab,
    }),
    enabled: !!filters.from && !!filters.to,
    placeholderData: (prev) => prev,
  });

  const segments = data?.segments || [];
  const bestRoas = segments.reduce((m, s) => (s.cost > 0 && s.roas > m ? s.roas : m), 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-card shadow-sm p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy-muted mb-2">Répartition du spend</p>
          <SegmentDonut segments={segments} />
        </div>
        <div className="bg-white border border-border rounded-card shadow-sm p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-navy-muted mb-2">ROAS par segment</p>
          <SegmentRoasBar segments={segments} />
        </div>
      </div>

      <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm">
        <table className="w-full text-[12px] text-navy border-collapse">
          <thead className="bg-bg-page">
            <tr className="border-b border-border">
              <th className="px-4 py-2.5 text-left  text-[10px] font-bold text-navy-muted uppercase tracking-wider">Segment</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold text-navy-muted uppercase tracking-wider">Coût</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold text-navy-muted uppercase tracking-wider">% Coût</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold text-navy-muted uppercase tracking-wider">Conv.</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold text-navy-muted uppercase tracking-wider">Revenue</th>
              <th className="px-4 py-2.5 text-right text-[10px] font-bold text-navy-muted uppercase tracking-wider">ROAS</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && !segments.length ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-navy-muted text-xs">Chargement…</td></tr>
            ) : !segments.length ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-navy-muted text-xs italic">Aucune donnée.</td></tr>
            ) : segments.map((s, i) => {
              const isBest = s.roas === bestRoas && bestRoas > 0;
              return (
                <tr key={s.segment} className={`border-b border-border/50 ${i % 2 === 1 ? 'bg-[#FAFBFD]' : 'bg-white'}`}>
                  <td className="px-4 py-2.5 font-medium text-navy">
                    <span className="inline-flex items-center gap-2">
                      {PrettySegment(tab, s.segment)}
                      {isBest && (
                        <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded bg-success-bg text-success border border-success/20">
                          Best ROAS
                        </span>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{fEur(s.cost)}</span>
                      <DeltaCell value={s.delta_cost} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      <span className="w-16 h-1.5 bg-bg-page rounded-full overflow-hidden">
                        <span className="block h-full bg-[#1877F2]" style={{ width: `${Math.min(100, s.cost_pct)}%` }} />
                      </span>
                      {s.cost_pct.toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums">
                    <div className="flex flex-col items-end">
                      <span>{fNum(s.conversions)}</span>
                      <DeltaCell value={s.delta_conversions} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold">
                    <div className="flex flex-col items-end">
                      <span>{fEur(s.revenue)}</span>
                      <DeltaCell value={s.delta_revenue} />
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-bold">
                    <div className="flex flex-col items-end">
                      <span className={roasTone(s.roas)}>{fROAS(s.roas)}</span>
                      <DeltaCell value={s.delta_roas} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AudienceSection({ filters, platform, scope }) {
  const [tab, setTab] = useState('placement');

  return (
    <div className="space-y-5">
      <WinnersLosersHero filters={filters} platform={platform} scope={scope} />

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-navy uppercase tracking-wider">Détail par dimension</h3>
          <div className="flex gap-1.5">
            {BREAKDOWN_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider rounded-inner border transition-colors ${
                  tab === t.key
                    ? 'bg-navy text-white border-navy'
                    : 'bg-white text-navy-muted border-border hover:border-navy/40'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <BreakdownDetail tab={tab} filters={filters} platform={platform} scope={scope} />
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────

export default function PaidSocialView({ filters }) {
  const [platform, setPlatform] = useState('meta');

  const { data: status } = useQuery({
    queryKey: ['paid-social', 'status'],
    queryFn: () => fetchApi('/api/paid-social/status', {}),
    staleTime: 5 * 60 * 1000,
  });

  const supportedMarkets = status?.meta_markets?.[META_BRAND] || META_SUPPORTED_MARKETS_FALLBACK;
  // Resolve every render — cheap, no useMemo overhead needed.
  const scope = resolveMetaScope(filters, supportedMarkets);

  const brandMismatch = filters.brand && filters.brand !== 'ALL' && filters.brand !== META_BRAND;
  const marketUnsupported = scope.fellBack && filters.market && filters.market !== 'ALL';

  const kpisQuery = useQuery({
    queryKey: ['paid-social', 'kpis', platform, scope.brand, scope.market, filters.from, filters.to, filters.compareTo],
    queryFn: () => fetchApi('/api/paid-social/kpis', {
      platform,
      brand: scope.brand,
      market: scope.market,
      from: filters.from,
      to: filters.to,
      compareTo: filters.compareTo,
    }),
    enabled: !!filters.from && !!filters.to,
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-6">
      {/* Platform toggle */}
      <div className="bg-white rounded-card p-4 border border-border shadow-card flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-navy-muted">Plateforme</span>
          <div className="flex gap-1 ml-2">
            {PLATFORMS.map((p) => {
              const active = platform === p.key && p.enabled;
              return (
                <button
                  key={p.key}
                  disabled={!p.enabled}
                  onClick={() => p.enabled && setPlatform(p.key)}
                  title={p.enabled ? '' : 'À venir prochainement'}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-inner border transition-colors ${
                    active
                      ? 'bg-[#1877F2] text-white border-[#1877F2]'
                      : p.enabled
                        ? 'bg-white text-navy-muted border-border hover:border-navy/40'
                        : 'bg-bg-page text-navy-muted/50 border-border cursor-not-allowed'
                  }`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    {p.label}
                    {!p.enabled && <span className="text-[9px]">🔒</span>}
                  </span>
                  {p.badge && (
                    <span className="absolute -top-2 -right-2 text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded bg-warning text-white">
                      {p.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div className="text-[11px] text-navy-muted">
          Marchés Meta : <span className="font-semibold text-navy">{supportedMarkets.join(' · ')}</span>
          <span className="mx-1.5 opacity-50">·</span>
          Vue actuelle : <span className="font-semibold text-navy">Brand Alpha {scope.market}</span>
        </div>
      </div>

      {/* Banners */}
      {status && !status.meta_configured && (
        <div className="bg-warning-bg border border-warning/30 rounded-card px-4 py-3 text-xs text-warning font-medium">
          ⚠️ Meta API non configurée — renseignez <code>META_ACCESS_TOKEN</code> et{' '}
          <code>META_AD_ACCOUNT_ID</code> dans le fichier <code>.env</code>.
        </div>
      )}
      {brandMismatch && (
        <div className="bg-blue-50 border border-blue-200 rounded-card px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
          <span>ℹ️</span>
          <span>
            Phase 1 — Meta Ads est uniquement disponible sur <strong>Brand Alpha</strong>.
            Le filtre marque du header est ignoré sur cette vue.
          </span>
        </div>
      )}
      {marketUnsupported && (
        <div className="bg-blue-50 border border-blue-200 rounded-card px-4 py-2.5 text-xs text-blue-700 flex items-center gap-2">
          <span>ℹ️</span>
          <span>
            Pas de compte Meta configuré pour <strong>{filters.market}</strong> — affichage de{' '}
            <strong>{scope.market}</strong>. Marchés disponibles : {supportedMarkets.join(', ')}.
          </span>
        </div>
      )}

      {/* KPIs */}
      <KpiScorecards data={kpisQuery.data} isLoading={kpisQuery.isLoading} />

      {/* Trend */}
      <TrendChart filters={filters} platform={platform} scope={scope} />

      {/* Campaigns */}
      <AccordionSection title="Détail des campagnes Meta" badge="Détail" defaultOpen={true}>
        <CampaignsTable filters={filters} platform={platform} scope={scope} />
      </AccordionSection>

      {/* Audience analysis */}
      <AccordionSection title="Performance par segment" badge="Audience" defaultOpen={true}>
        <AudienceSection filters={filters} platform={platform} scope={scope} />
      </AccordionSection>
    </div>
  );
}
