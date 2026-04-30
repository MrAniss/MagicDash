import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

// ─── Main view ────────────────────────────────────────────

export default function ShoppingView({ filters }) {
  const { brand, market, from, to } = filters;

  return (
    <div className="space-y-6">
      <PriceScorecards brand={brand} market={market} from={from} to={to} />

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

      {/* Scoring charts (CC FR only — hidden unless brand=CC and market=FR) */}
      {brand === 'COCOONCENTER' && market === 'FR' && (
        <ShoppingScoringCharts brand={brand} market={market} from={from} to={to} />
      )}
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
      render: (r) => (
        <div className="max-w-[300px] truncate font-medium" title={r.title}>
          {r.title || r.item_id}
        </div>
      ),
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
      render: (r) => (r.price != null ? fEur(r.price) : '—'),
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
    { key: 'revenue', label: 'REVENUE', align: 'right' },
    { key: 'delta_revenue', label: 'DELTA REV', align: 'right', isPct: true },
    { key: 'roas', label: 'ROAS', align: 'right' },
  ];

  const getExportData = (items) =>
    (items || []).map((it) => ({
      label: it.label,
      revenue: it.current?.revenue || 0,
      delta_revenue: it.delta_revenue || 0,
      roas: it.current?.roas || 0,
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
      <table className="w-full text-[13px] text-navy border-collapse">
        <thead className="sticky top-0 z-10 bg-white">
          <tr className="bg-bg-page border-b border-border">
            <th className="px-3 py-2 text-left text-[10px] font-bold text-navy-muted uppercase tracking-wider">
              {view === 'product' ? 'ID / PRODUIT' : view === 'brand' ? 'MARQUE' : 'CATÉGORIE'}
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-bold text-navy-muted uppercase tracking-wider">
              REVENUE
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-bold text-navy-muted uppercase tracking-wider">
              Δ REV.
            </th>
            <th className="px-3 py-2 text-right text-[10px] font-bold text-navy-muted uppercase tracking-wider">
              ROAS
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr
              key={i}
              className={`border-b border-border/50 hover:bg-navy/5 transition-colors ${i % 2 === 1 ? 'bg-[#FAFBFD]' : 'bg-white'}`}
            >
              <td className="px-3 py-3">
                <div className="flex flex-col">
                  {view === 'product' && (
                    <span className="text-[10px] font-bold text-navy-muted tabular-nums">
                      {it.item_id}
                    </span>
                  )}
                  <span className="font-medium truncate max-w-[200px]" title={it.label}>
                    {it.label}
                  </span>
                </div>
              </td>
              <td className="px-3 py-3 text-right font-medium tabular-nums">
                {fEur(it.current?.revenue || 0)}
              </td>
              <td
                className={`px-3 py-3 text-right font-bold tabular-nums ${it.delta_revenue > 0 ? 'text-success' : 'text-danger'}`}
              >
                {it.delta_revenue > 0 ? '▲' : '▼'} {Math.abs(it.delta_revenue).toFixed(1)}%
              </td>
              <td className="px-3 py-3 text-right">
                <span
                  className={`px-1.5 py-0.5 rounded-sm font-bold tabular-nums ${it.current?.roas >= 4 ? 'bg-success/10 text-success' : it.current?.roas >= 2.5 ? 'bg-warning/10 text-warning' : 'bg-danger/10 text-danger'}`}
                >
                  {fROASx(it.current?.roas)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FeedQualitySection({ brand, market }) {
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
        <span>✨</span> Aucun problème critique détecté dans le flux.
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4">
        {Object.entries(data.summary)
          .filter(([k]) => !['total_issues', 'other'].includes(k))
          .map(([key, count]) => (
            <div key={key} className="bg-white p-3.5 rounded-card border border-border shadow-sm">
              <p className="text-[10px] font-bold text-navy-muted uppercase tracking-widest mb-1">
                {key}
              </p>
              <p className={`text-xl font-bold ${count > 0 ? 'text-danger' : 'text-success'}`}>
                {fNum(count)}
              </p>
            </div>
          ))}
      </div>

      <div className="bg-white rounded-card border border-border overflow-hidden shadow-sm">
        <div className="overflow-y-auto max-h-[500px]">
          <table className="w-full text-[13px] text-navy border-collapse">
            <thead className="sticky top-0 z-10 bg-white shadow-sm">
              <tr className="bg-bg-page border-b border-border">
                <th className="px-4 py-3 text-left text-[10px] font-bold text-navy-muted uppercase tracking-wider">
                  ID / Produit
                </th>
                <th className="px-4 py-3 text-left text-[10px] font-bold text-navy-muted uppercase tracking-wider">
                  Problèmes détectés
                </th>
                <th className="px-4 py-3 text-center text-[10px] font-bold text-navy-muted uppercase tracking-wider">
                  Sévérité
                </th>
              </tr>
            </thead>
            <tbody>
              {data.products.map((p, i) => (
                <tr
                  key={i}
                  className={`border-b border-border/50 hover:bg-navy/5 transition-colors ${i % 2 === 1 ? 'bg-[#FAFBFD]' : 'bg-white'}`}
                >
                  <td className="px-4 py-4">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-bold text-navy-muted tabular-nums">
                        {p.item_id}
                      </span>
                      <span className="font-medium truncate max-w-[280px] text-navy">
                        {p.title}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex flex-wrap gap-1.5">
                      {p.issues.map((iss, j) => (
                        <span
                          key={j}
                          className="px-2 py-0.5 rounded-sm bg-danger/10 text-danger border border-danger/20 text-[10px] font-bold uppercase tracking-tight"
                          title={iss.description}
                        >
                          {iss.type}: {iss.attribute}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${p.status === 'disapproved' ? 'bg-danger text-white' : 'bg-warning text-navy'}`}
                    >
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
