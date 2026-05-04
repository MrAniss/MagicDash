import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  LabelList,
} from 'recharts';
import { fEur, fNum, fROAS, fPct } from '../utils/formatters';
import { fetchApi } from '../utils/api';
import { downloadCsv, copyTsv } from '../utils/exportTable';
import AccordionSection from './AccordionSection';
import ShoppingScoringCharts from './ShoppingScoringCharts';
import DrilldownTable from './DrilldownTable';
import ExportButtons from './ExportButtons';

// ─── Helpers ──────────────────────────────────────────────

function fROASx(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(2) + '×';
}

function ErrorState({ msg }) {
  return (
    <div className="text-center py-8 text-danger text-sm">{msg || 'Erreur de chargement'}</div>
  );
}

function CompBadge({ status, delta_pct }) {
  if (!status || status === 'NO_DATA')
    return <span className="text-[10px] text-navy-muted">—</span>;
  const fmt = delta_pct != null ? `${delta_pct > 0 ? '+' : ''}${delta_pct.toFixed(1)}%` : status;
  const cls =
    {
      COMPETITIVE: 'bg-success-bg text-success border-success/20',
      ON_PAR: 'bg-[#E3F2FD] text-[#1565C0] border-[#1565C0]/20',
      EXPENSIVE: 'bg-danger-bg text-danger border-danger/20',
    }[status] || 'bg-bg-page text-navy-muted border-border';
  return (
    <span
      className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tracking-wider ${cls}`}
    >
      {fmt}
    </span>
  );
}

function DeltaCell({ value }) {
  if (value == null || isNaN(value)) return <span className="text-navy-muted">—</span>;
  const isPos = value > 0;
  return (
    <span
      className={`text-[11px] font-medium ${isPos ? 'text-success' : value < 0 ? 'text-danger' : 'text-navy-muted'}`}
    >
      {isPos ? '+' : ''}
      {value.toFixed(1)}%
    </span>
  );
}

function PriceScorecards({ brand, market, from, to }) {
  const { data, isLoading } = useQuery({
    queryKey: ['shopping', 'price-summary', brand, market, from, to],
    queryFn: () => fetchApi('/api/shopping/price-summary', { brand, market, from, to }),
  });

  if (isLoading)
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-card border border-border animate-pulse" />
        ))}
      </div>
    );

  const cards = [
    { label: 'Produits Total', value: data?.total || 0, color: 'text-navy', icon: '📦' },
    {
      label: 'Compétitifs',
      value: data?.counts?.COMPETITIVE || 0,
      sub: fPct(data?.pct?.COMPETITIVE),
      color: 'text-success',
      icon: '✅',
    },
    {
      label: 'Prix Marché',
      value: data?.counts?.ON_PAR || 0,
      sub: fPct(data?.pct?.ON_PAR),
      color: 'text-blue-500',
      icon: '⚖️',
    },
    {
      label: 'Trop Chers',
      value: data?.counts?.EXPENSIVE || 0,
      sub: fPct(data?.pct?.EXPENSIVE),
      color: 'text-danger',
      icon: '⚠️',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((c, i) => (
        <div
          key={i}
          className="bg-white p-4 rounded-card border border-border shadow-sm flex items-center gap-4"
        >
          <div className="text-2xl bg-bg-page w-12 h-12 flex items-center justify-center rounded-full shadow-inner">
            {c.icon}
          </div>
          <div>
            <p className="text-[10px] font-bold text-navy-muted uppercase tracking-widest leading-tight mb-0.5">
              {c.label}
            </p>
            <div className="flex items-baseline gap-2">
              <span className={`text-2xl font-bold ${c.color}`}>{fNum(c.value)}</span>
              {c.sub && <span className="text-xs font-semibold text-navy-muted/60">({c.sub})</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Pie charts (price scoring distribution) ──────────────

const PRICE_STATUS_META = {
  COMPETITIVE: { label: 'Compétitifs', color: '#0E9F6E' },
  ON_PAR:      { label: 'Prix Marché', color: '#1E88E5' },
  EXPENSIVE:   { label: 'Trop Chers',  color: '#E8524A' },
  NO_DATA:     { label: 'Sans data',   color: '#9CA3AF' },
};

function PricePie({ title, data, totalLabel, totalValue, valueFormatter }) {
  const chartData = data.filter((d) => d.value > 0);
  return (
    <div className="bg-white p-4 rounded-card border border-border shadow-sm">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] font-bold text-navy-muted uppercase tracking-widest">{title}</p>
        <p className="text-[10px] font-semibold text-navy-muted/70">
          {totalLabel}: <span className="text-navy">{valueFormatter(totalValue)}</span>
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 items-center">
        <ResponsiveContainer width="100%" height={140}>
          <PieChart>
            <Pie
              data={chartData}
              dataKey="value"
              nameKey="label"
              innerRadius={36}
              outerRadius={62}
              paddingAngle={2}
              isAnimationActive={false}
            >
              {chartData.map((entry) => (
                <Cell key={entry.key} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              formatter={(v, name) => [valueFormatter(v), name]}
              contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #E2E6EF' }}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1">
          {data.map((item) => (
            <div key={item.key} className="flex items-center gap-1 whitespace-nowrap">
              <span
                className="w-2 h-2 rounded-sm flex-shrink-0"
                style={{ background: item.color }}
              />
              <span className="text-[9px] text-navy-muted truncate">{item.label}</span>
              <span className="text-[9px] font-semibold text-navy tabular-nums">
                {valueFormatter(item.value)}
              </span>
              <span className="text-[8px] text-navy-muted/60 tabular-nums">
                ({fPct(item.pct)})
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function RoasBar({ title, data, totalLabel, totalValue }) {
  // Sort descending so the strongest ROAS sits on top — easy visual ranking.
  const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
  return (
    <div className="bg-white p-4 rounded-card border border-border shadow-sm">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-[10px] font-bold text-navy-muted uppercase tracking-widest">{title}</p>
        <p className="text-[10px] font-semibold text-navy-muted/70">
          {totalLabel}: <span className="text-navy">{fROASx(totalValue)}</span>
        </p>
      </div>
      <ResponsiveContainer width="100%" height={140}>
        <BarChart data={sorted} layout="vertical" margin={{ top: 4, right: 32, left: 0, bottom: 0 }}>
          <XAxis
            type="number"
            domain={[0, 'auto']}
            tick={{ fontSize: 9 }}
            tickFormatter={(v) => v + '×'}
          />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 9 }} width={68} />
          <Tooltip
            formatter={(v) => [fROASx(v), 'ROAS']}
            contentStyle={{ fontSize: 10, borderRadius: 6, border: '1px solid #E2E6EF' }}
          />
          <Bar dataKey="value" radius={[3, 3, 3, 3]} isAnimationActive={false}>
            {sorted.map((entry) => (
              <Cell key={entry.key} fill={entry.color} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v) => fROASx(v)}
              style={{ fontSize: 9, fill: '#334155' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function PriceScoringPies({ brand, market, from, to }) {
  const { data, isLoading } = useQuery({
    queryKey: ['shopping', 'price-summary', brand, market, from, to],
    queryFn: () => fetchApi('/api/shopping/price-summary', { brand, market, from, to }),
  });

  if (isLoading)
    return (
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-44 bg-white rounded-card border border-border animate-pulse" />
        ))}
      </div>
    );

  const buildSeries = (countsOrCost, pctMap) =>
    Object.entries(PRICE_STATUS_META).map(([key, meta]) => ({
      key,
      label: meta.label,
      color: meta.color,
      value: countsOrCost?.[key] || 0,
      pct: pctMap?.[key] || 0,
    }));

  const productSeries = buildSeries(data?.counts,  data?.pct);
  const costSeries    = buildSeries(data?.cost,    data?.cost_pct);
  const revenueSeries = buildSeries(data?.revenue, data?.revenue_pct);
  const roasSeries    = buildSeries(data?.roas,    data?.revenue_pct); // pct = revenue weight, contextual

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-6">
      <PricePie
        title="Répartition des produits par scoring prix"
        data={productSeries}
        totalLabel="Total"
        totalValue={data?.total || 0}
        valueFormatter={(v) => fNum(v)}
      />
      <PricePie
        title="Investissement par scoring prix"
        data={costSeries}
        totalLabel="Coût"
        totalValue={data?.total_cost || 0}
        valueFormatter={(v) => fEur(v)}
      />
      <PricePie
        title="Revenue par scoring prix"
        data={revenueSeries}
        totalLabel="Revenue"
        totalValue={data?.total_revenue || 0}
        valueFormatter={(v) => fEur(v)}
      />
      <RoasBar
        title="ROAS par scoring prix"
        data={roasSeries}
        totalLabel="ROAS global"
        totalValue={data?.total_roas || 0}
      />
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────

export default function ShoppingView({ filters }) {
  const { brand, market, from, to } = filters;

  return (
    <div className="space-y-6">
      <PriceScorecards brand={brand} market={market} from={from} to={to} />
      <PriceScoringPies brand={brand} market={market} from={from} to={to} />

      {/* Scoring POAS (CC FR only — hidden unless brand=CC and market=FR) */}
      {brand === 'COCOONCENTER' && market === 'FR' && (
        <ShoppingScoringCharts brand={brand} market={market} from={from} to={to} />
      )}

      {/* Section 1 : Top marques (Opened by default) */}
      <AccordionSection
        title="Performances par Marques"
        badge="Catalogue"
        defaultOpen={true}
        subtitle="Détail de la performance agrégée par marque et produit"
      >
        <BrandsSection brand={brand} market={market} from={from} to={to} />
      </AccordionSection>

      {/* Section 2 : Top & Flop (Opened by default) */}
      <AccordionSection
        title="Top & Flop Shopping"
        badge="Trends"
        defaultOpen={true}
        subtitle="Les plus fortes variations de Revenue vs période précédente"
      >
        <TopFlopSection brand={brand} market={market} from={from} to={to} />
      </AccordionSection>

      {/* Section 3 : Qualité du flux */}
      <AccordionSection
        title="Qualité du Flux Merchant Center"
        badge="Alertes"
        defaultOpen={false}
        subtitle="Alertes et problèmes bloquants par produit"
      >
        <FeedQualitySection brand={brand} market={market} />
      </AccordionSection>
    </div>
  );
}

function BrandsSection({ brand, market, from, to }) {
  const [copied, setCopied] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['shopping', 'brands-detail', brand, market, from, to],
    queryFn: () => fetchApi('/api/shopping/brands-detail', { brand, market, from, to }),
  });

  const columns = [
    { key: 'product_brand', label: 'Marque', align: 'left' },
    { key: 'product_count', label: 'Prods', align: 'right', render: (r) => fNum(r.product_count) },
    // Trafic
    {
      key: 'impressions',
      label: 'Impr.',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span>{fNum(r.impressions)}</span>
          <DeltaCell value={r.delta_impressions} />
        </div>
      ),
    },
    {
      key: 'clicks',
      label: 'Clics',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span>{fNum(r.clicks)}</span>
          <DeltaCell value={r.delta_clicks} />
        </div>
      ),
    },
    {
      key: 'ctr',
      label: 'CTR',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span>{fPct(r.ctr)}</span>
          <DeltaCell value={r.delta_ctr} />
        </div>
      ),
    },
    {
      key: 'cpc',
      label: 'CPC',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span>{fEur(r.cpc, true)}</span>
          <DeltaCell value={r.delta_cpc} />
        </div>
      ),
    },
    // Business
    {
      key: 'cost',
      label: 'Coût',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span>{fEur(r.cost)}</span>
          <DeltaCell value={r.delta_cost} />
        </div>
      ),
    },
    {
      key: 'conversions',
      label: 'Conv.',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span>{fNum(r.conversions)}</span>
          <DeltaCell value={r.delta_conversions} />
        </div>
      ),
    },
    {
      key: 'revenue',
      label: 'Revenue',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span className="font-bold text-navy">{fEur(r.revenue)}</span>
          <DeltaCell value={r.delta_revenue} />
        </div>
      ),
    },
    {
      key: 'cvr',
      label: 'CVR',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span>{fPct(r.cvr)}</span>
          <DeltaCell value={r.delta_cvr} />
        </div>
      ),
    },
    {
      key: 'roas',
      label: 'ROAS',
      align: 'right',
      render: (r) => (
        <div className="flex flex-col">
          <span
            className={`font-bold ${r.roas >= 4 ? 'text-success' : r.roas >= 2.5 ? 'text-warning' : 'text-danger'}`}
          >
            {fROAS(r.roas)}
          </span>
          <DeltaCell value={r.delta_roas} />
        </div>
      ),
    },
    {
      key: 'avg_delta_pct',
      label: 'Δ Prix',
      align: 'right',
      render: (r) => (
        <CompBadge
          status={
            r.avg_delta_pct == null
              ? 'NO_DATA'
              : r.avg_delta_pct < -5
                ? 'COMPETITIVE'
                : r.avg_delta_pct > 5
                  ? 'EXPENSIVE'
                  : 'ON_PAR'
          }
          delta_pct={r.avg_delta_pct}
        />
      ),
      isPct: true,
    },
  ];

  const drilldownColumns = [
    { key: 'item_id', label: 'ID', align: 'left' },
    {
      key: 'title',
      label: 'Produit',
      align: 'left',
      render: (r) => {
        const label = r.title || r.item_id;
        return (
          <div className="flex items-center gap-1.5 max-w-[320px]">
            <span className="truncate font-medium text-navy" title={r.title}>
              {label}
            </span>
            {r.link && (
              <a
                href={r.link}
                target="_blank"
                rel="noopener noreferrer"
                title="Ouvrir la fiche produit"
                aria-label="Ouvrir la fiche produit"
                onClick={(e) => e.stopPropagation()}
                className="flex-shrink-0 inline-flex items-center justify-center w-5 h-5 rounded border border-border text-navy-muted hover:text-mint-dark hover:border-mint-dark transition-colors"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M14 3h7v7" />
                  <path d="M10 14L21 3" />
                  <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                </svg>
              </a>
            )}
          </div>
        );
      },
    },
    { key: 'impressions', label: 'Impr.', align: 'right', render: (r) => fNum(r.impressions) },
    { key: 'clicks', label: 'Clics', align: 'right', render: (r) => fNum(r.clicks) },
    { key: 'cost', label: 'Coût', align: 'right', render: (r) => fEur(r.cost) },
    { key: 'revenue', label: 'Revenue', align: 'right', render: (r) => fEur(r.revenue) },
    {
      key: 'roas',
      label: 'ROAS',
      align: 'right',
      render: (r) => (
        <span
          className={`font-bold ${r.roas >= 4 ? 'text-success' : r.roas >= 2.5 ? 'text-warning' : 'text-danger'}`}
        >
          {fROAS(r.roas)}
        </span>
      ),
    },
    {
      key: 'price',
      label: 'Notre Prix',
      align: 'right',
      render: (r) =>
        r.price == null ? (
          '—'
        ) : (
          <span className="inline-flex items-center gap-1.5 justify-end">
            {r.on_promo && (
              <span
                title={r.regular_price != null ? `Prix régulier : ${fEur(r.regular_price)}` : 'En promo'}
                className="text-[9px] font-bold px-1 py-0.5 rounded bg-[#FFF1D6] text-[#B45309] border border-[#B45309]/20 uppercase tracking-wider"
              >
                Promo
              </span>
            )}
            <span>{fEur(r.price)}</span>
            {r.on_promo && r.regular_price != null && (
              <span className="text-[10px] text-navy-muted line-through">
                {fEur(r.regular_price)}
              </span>
            )}
          </span>
        ),
    },
    {
      key: 'benchmark_price',
      label: 'Marché',
      align: 'right',
      render: (r) => (r.benchmark_price != null ? fEur(r.benchmark_price) : '—'),
    },
    {
      key: 'delta_pct',
      label: 'Δ Prix',
      align: 'right',
      render: (r) => <CompBadge status={r.price_status} delta_pct={r.delta_pct} />,
      isPct: true,
    },
  ];

  const fetchDrilldown = (productBrand) =>
    fetchApi('/api/shopping/products-by-brand', {
      brand,
      market,
      from,
      to,
      product_brand: productBrand,
    });

  const exportProps = {
    onCsv: () => downloadCsv(columns, data, `shopping-marques-${market}.csv`),
    onSheets: async () => {
      await copyTsv(columns, data);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    },
    copied,
  };

  return (
    <DrilldownTable
      data={data}
      isLoading={isLoading}
      columns={columns}
      drilldownKey="product_brand"
      drilldownColumns={drilldownColumns}
      drilldownQueryFn={fetchDrilldown}
      maxHeight="600px"
      exportProps={exportProps}
    />
  );
}

function TopFlopSection({ brand, market, from, to }) {
  const [view, setView] = useState('brand'); // 'brand' | 'product' | 'category'
  const [copiedTop, setCopiedTop] = useState(false);
  const [copiedFlop, setCopiedFlop] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['shopping', 'top-flop', brand, market, from, to, view],
    queryFn: () => fetchApi('/api/shopping/top-flop', { brand, market, from, to, view, limit: 15 }),
  });

  const COLUMNS = [
    {
      key: 'label',
      label: view === 'product' ? 'PRODUIT' : view === 'brand' ? 'MARQUE' : 'CATEGORIE',
      align: 'left',
    },
    { key: 'cost', label: 'COST', align: 'right' },
    { key: 'delta_cost', label: 'Δ COST %', align: 'right', isPct: true },
    { key: 'revenue', label: 'REVENUE', align: 'right' },
    { key: 'delta_revenue', label: 'Δ REV %', align: 'right', isPct: true },
    { key: 'roas', label: 'ROAS', align: 'right' },
    { key: 'delta_roas', label: 'Δ ROAS %', align: 'right', isPct: true },
  ];

  const getExportData = (items) =>
    (items || []).map((it) => ({
      label: it.label,
      cost: it.current?.cost || 0,
      delta_cost: it.delta_cost || 0,
      revenue: it.current?.revenue || 0,
      delta_revenue: it.delta_revenue || 0,
      roas: it.current?.roas || 0,
      delta_roas: it.delta_roas || 0,
    }));

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        {['brand', 'product', 'category'].map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-inner transition-colors border ${
              view === v
                ? 'bg-navy text-white border-navy shadow-sm'
                : 'bg-white text-navy-muted border-border hover:border-navy/40'
            }`}
          >
            {v === 'brand' ? 'Marque' : v === 'product' ? 'Produit' : 'Catégorie'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-sm text-navy-muted italic">
          Chargement des tendances...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm">
            <div className="bg-success-bg px-4 py-2.5 border-b border-border flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-widest text-success">
                  📈 Top Trend Revenue
                </span>
                <span className="text-[10px] text-success/60 font-bold uppercase">
                  Variation vs P-1
                </span>
              </div>
              <ExportButtons
                onCsv={() =>
                  downloadCsv(COLUMNS, getExportData(data?.top), `shopping-top-${view}.csv`)
                }
                onSheets={async () => {
                  await copyTsv(COLUMNS, getExportData(data?.top));
                  setCopiedTop(true);
                  setTimeout(() => setCopiedTop(false), 2000);
                }}
                copied={copiedTop}
              />
            </div>
            <TopFlopTable items={data?.top || []} view={view} />
          </div>

          <div className="bg-white border border-border rounded-card overflow-hidden shadow-sm">
            <div className="bg-danger-bg px-4 py-2.5 border-b border-border flex items-center justify-between">
              <div className="flex flex-col">
                <span className="text-[11px] font-bold uppercase tracking-widest text-danger">
                  📉 Flop Trend Revenue
                </span>
                <span className="text-[10px] text-danger/60 font-bold uppercase">
                  Variation vs P-1
                </span>
              </div>
              <ExportButtons
                onCsv={() =>
                  downloadCsv(COLUMNS, getExportData(data?.flop), `shopping-flop-${view}.csv`)
                }
                onSheets={async () => {
                  await copyTsv(COLUMNS, getExportData(data?.flop));
                  setCopiedFlop(true);
                  setTimeout(() => setCopiedFlop(false), 2000);
                }}
                copied={copiedFlop}
              />
            </div>
            <TopFlopTable items={data?.flop || []} view={view} />
          </div>
        </div>
      )}
    </div>
  );
}

function TopFlopTable({ items, view }) {
  if (!items.length)
    return (
      <div className="p-12 text-center text-xs text-navy-muted">Aucune donnée significative</div>
    );

  return (
    <div className="overflow-x-auto overflow-y-auto max-h-[400px]">
      <table className="w-full text-[11px] text-navy border-collapse">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="bg-bg-page border-b border-border">
            <th className="px-2 py-2 text-left text-[9px] font-bold text-navy-muted uppercase tracking-wider">
              {view === 'product' ? 'ID / PRODUIT' : view === 'brand' ? 'MARQUE' : 'CATÉGORIE'}
            </th>
            <th className="px-2 py-2 text-right text-[9px] font-bold text-navy-muted uppercase tracking-wider">
              COST
            </th>
            <th className="px-2 py-2 text-right text-[9px] font-bold text-navy-muted uppercase tracking-wider">
              Δ %
            </th>
            <th className="px-2 py-2 text-right text-[9px] font-bold text-navy-muted uppercase tracking-wider">
              REVENUE
            </th>
            <th className="px-2 py-2 text-right text-[9px] font-bold text-navy-muted uppercase tracking-wider">
              Δ %
            </th>
            <th className="px-2 py-2 text-right text-[9px] font-bold text-navy-muted uppercase tracking-wider">
              ROAS
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const dCost = it.delta_cost;
            const dRev  = it.delta_revenue;
            const dRoas = it.delta_roas;
            const renderDelta = (v) => {
              if (v == null) return <span className="text-navy-muted">—</span>;
              const cls = v > 0 ? 'text-success' : v < 0 ? 'text-danger' : 'text-navy-muted';
              return (
                <span className={`font-medium tabular-nums ${cls}`}>
                  {v > 0 ? '▲' : v < 0 ? '▼' : ''} {Math.abs(v).toFixed(1)}%
                </span>
              );
            };
            return (
              <tr
                key={i}
                className={`border-b border-border/50 hover:bg-navy/5 transition-colors ${i % 2 === 1 ? 'bg-[#FAFBFD]' : 'bg-white'}`}
              >
                <td className="px-2 py-2.5">
                  <div className="flex flex-col">
                    {view === 'product' && (
                      <span className="text-[9px] font-bold text-navy-muted tabular-nums">
                        {it.item_id}
                      </span>
                    )}
                    <span className="font-medium truncate max-w-[180px]" title={it.label}>
                      {it.label}
                    </span>
                  </div>
                </td>
                <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                  {fEur(it.current?.cost || 0)}
                </td>
                <td className="px-2 py-2.5 text-right">{renderDelta(dCost)}</td>
                <td className="px-2 py-2.5 text-right font-medium tabular-nums">
                  {fEur(it.current?.revenue || 0)}
                </td>
                <td className="px-2 py-2.5 text-right">{renderDelta(dRev)}</td>
                <td className="px-2 py-2.5 text-right">
                  <div className="flex flex-col items-end gap-0.5">
                    <span
                      className={`px-1.5 py-0.5 rounded-sm font-bold tabular-nums ${it.current?.roas >= 4 ? 'bg-success/10 text-success' : it.current?.roas >= 2.5 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`}
                    >
                      {fROASx(it.current?.roas)}
                    </span>
                    <span className="text-[10px]">{renderDelta(dRoas)}</span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function FeedQualitySection({ brand, market }) {
  const [search, setSearch]       = useState('');
  const [codeFilter, setCodeFilter] = useState(null); // null = all reasons

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['shopping', 'feed-quality', brand, market],
    queryFn: () => fetchApi('/api/shopping/feed-quality', { brand, market }),
  });

  if (isLoading)
    return (
      <div className="py-12 text-center text-sm text-navy-muted italic">
        Analyse du flux Merchant Center...
      </div>
    );
  if (isError) return <ErrorState msg={error?.message} />;
  if (!data?.products?.length)
    return (
      <div className="py-12 text-center text-sm text-success font-bold flex items-center justify-center gap-2">
        <span>✨</span> Aucun produit refusé sur ce périmètre.
      </div>
    );

  const reasonSummary = data.reason_summary || [];
  const total         = data.total_disapproved || 0;

  // Apply filters
  const filtered = data.products.filter((p) => {
    if (codeFilter && !p.issues.some((iss) => iss.code === codeFilter)) return false;
    if (search) {
      const s = search.toLowerCase();
      if (!(p.item_id?.toLowerCase().includes(s) || p.title?.toLowerCase().includes(s))) {
        return false;
      }
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Header : total + chips de raisons */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold text-navy-muted uppercase tracking-widest">
          {fNum(total)} produits refusés
        </span>
        <span className="text-[11px] text-navy-muted/60">·</span>
        <span className="text-[10px] text-navy-muted uppercase tracking-wider">Filtrer&nbsp;:</span>
        <button
          onClick={() => setCodeFilter(null)}
          className={`px-2 py-0.5 rounded-sm text-[10px] font-bold uppercase tracking-tight border transition-colors ${
            codeFilter == null
              ? 'bg-navy text-white border-navy'
              : 'bg-white text-navy-muted border-border hover:border-navy/40'
          }`}
        >
          Toutes ({fNum(total)})
        </button>
        {reasonSummary.slice(0, 12).map((r) => (
          <button
            key={r.code}
            onClick={() => setCodeFilter(r.code === codeFilter ? null : r.code)}
            title={r.description}
            className={`px-2 py-0.5 rounded-sm text-[10px] font-bold tracking-tight border transition-colors ${
              codeFilter === r.code
                ? 'bg-danger text-white border-danger'
                : 'bg-danger/5 text-danger border-danger/20 hover:bg-danger/10'
            }`}
          >
            {r.code} ({fNum(r.count)})
          </button>
        ))}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Rechercher par ID ou titre…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full md:w-80 px-3 py-1.5 text-[12px] border border-border rounded-inner focus:outline-none focus:border-navy/50 bg-white"
      />

      {/* Tableau */}
      <div className="bg-white rounded-card border border-border overflow-hidden shadow-sm">
        <div className="overflow-y-auto max-h-[600px]">
          <table className="w-full text-[12px] text-navy border-collapse">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr className="bg-bg-page border-b border-border">
                <th className="px-3 py-2 text-left text-[10px] font-bold text-navy-muted uppercase tracking-wider w-[260px]">
                  ID / Produit
                </th>
                <th className="px-3 py-2 text-left text-[10px] font-bold text-navy-muted uppercase tracking-wider">
                  Raison(s) Merchant Center
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={2} className="px-4 py-12 text-center text-xs text-navy-muted italic">
                    Aucun produit ne correspond aux filtres.
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => (
                  <tr
                    key={p.item_id + i}
                    className={`border-b border-border/50 hover:bg-navy/5 transition-colors align-top ${
                      i % 2 === 1 ? 'bg-[#FAFBFD]' : 'bg-white'
                    }`}
                  >
                    <td className="px-3 py-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] font-bold text-navy-muted tabular-nums break-all">
                          {p.item_id}
                        </span>
                        <span className="font-medium text-navy text-[12px] leading-snug" title={p.title}>
                          {p.title || '—'}
                        </span>
                        {p.brand && (
                          <span className="text-[10px] text-navy-muted">{p.brand}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="space-y-2">
                        {p.issues.map((iss, j) => (
                          <div
                            key={j}
                            className="border-l-2 border-danger pl-3 py-0.5 text-[12px]"
                          >
                            <div className="font-semibold text-navy leading-snug">
                              {iss.description || iss.code}
                            </div>
                            {iss.detail && iss.detail !== iss.description && (
                              <div className="text-[11px] text-navy-muted mt-0.5 leading-snug">
                                {iss.detail}
                              </div>
                            )}
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {iss.attribute && (
                                <span className="px-1.5 py-0.5 rounded-sm bg-bg-page text-navy-muted border border-border text-[10px] font-mono">
                                  {iss.attribute}
                                </span>
                              )}
                              {iss.code && (
                                <span className="px-1.5 py-0.5 rounded-sm bg-danger/10 text-danger text-[10px] font-mono">
                                  {iss.code}
                                </span>
                              )}
                              {iss.resolution && (
                                <span className="text-[10px] text-navy-muted/70 uppercase tracking-tight">
                                  · {iss.resolution.replace(/_/g, ' ')}
                                </span>
                              )}
                              {iss.documentation && (
                                <a
                                  href={iss.documentation}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-[10px] text-blue-600 hover:underline"
                                >
                                  Doc ↗
                                </a>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
