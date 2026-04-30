import { useState, Fragment, useRef, useEffect } from 'react';
import { useComarketData } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fROAS, fEurCompact } from '../utils/formatters';
import CostKpiChart from './CostKpiChart';

// ── Custom Selector Component (Header Style) ──
function BrandSelector({ options, selected, onSelect }) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = selected === 'ALL' ? 'Toutes les marques' : selected;

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-border shadow-sm rounded-card hover:border-navy-muted transition-colors min-w-[180px]"
      >
        <span className="text-[10px] text-navy-muted font-bold uppercase tracking-wider">
          Marque:
        </span>
        <span className="text-xs font-semibold text-navy truncate">{selectedLabel}</span>
        <svg
          className={`w-3.5 h-3.5 text-navy-muted ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-full bg-white border border-border-strong shadow-xl rounded-card overflow-hidden z-[60] animate-in fade-in zoom-in-95 duration-100">
          <div className="max-h-[300px] overflow-y-auto py-1">
            <button
              onClick={() => {
                onSelect('ALL');
                setIsOpen(false);
              }}
              className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center gap-2 ${selected === 'ALL' ? 'bg-mint-bg text-navy' : 'text-navy hover:bg-bg-page'}`}
            >
              Toutes les marques
              {selected === 'ALL' && (
                <svg
                  className="w-3 h-3 text-navy ml-auto"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </button>
            <div className="h-px bg-border mx-2 my-1" />
            {options.map((brand) => (
              <button
                key={brand}
                onClick={() => {
                  onSelect(brand);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-4 py-2 text-xs font-medium transition-colors flex items-center gap-2 ${selected === brand ? 'bg-mint-bg text-navy' : 'text-navy hover:bg-bg-page'}`}
              >
                {brand}
                {selected === brand && (
                  <svg
                    className="w-3 h-3 text-navy ml-auto"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2.5}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ordered KPIs
const KPI_CARDS = [
  {
    key: 'impressions',
    label: 'IMPRESSIONS',
    format: fNum,
    deltaKey: 'impressions_pct',
    deltaType: 'pct',
    accent: '#8896B0',
  },
  {
    key: 'clicks',
    label: 'CLICS',
    format: fNum,
    deltaKey: 'clicks_pct',
    deltaType: 'pct',
    accent: '#378ADD',
  },
  {
    key: 'ctr',
    label: 'CTR',
    format: fCtr,
    deltaKey: 'ctr_pct',
    deltaType: 'pct',
    accent: '#D4537E',
  },
  {
    key: 'spend',
    label: 'COÛT',
    format: fEurCompact,
    deltaKey: 'spend_pct',
    deltaType: 'pct',
    accent: '#F5A623',
  },
  {
    key: 'cpc',
    label: 'CPC',
    format: fEur,
    deltaKey: 'cpc_pct',
    deltaType: 'pct',
    accent: '#9B59B6',
  },
  {
    key: 'conversions',
    label: 'CONVERSIONS',
    format: fNum,
    deltaKey: 'conversions_pct',
    deltaType: 'pct',
    accent: '#1A2E4A',
  },
  {
    key: 'revenue',
    label: 'REVENUE',
    format: fEurCompact,
    deltaKey: 'revenue_pct',
    deltaType: 'pct',
    accent: '#00B87A',
  },
  {
    key: 'cvr',
    label: 'CVR',
    format: fPct,
    deltaKey: 'cvr_pct',
    deltaType: 'pct',
    accent: '#E67E22',
  },
  {
    key: 'roas',
    label: 'ROAS',
    format: fROAS,
    deltaKey: 'roas_pct',
    deltaType: 'pct',
    accent: '#00E89A',
  },
];

const TABLE_COLS = [
  { key: 'label', label: 'MARQUE / CAMPAGNE', align: 'left', minWidth: '220px' },
  { key: 'impressions', label: 'IMPR.', format: fNum, delta: 'delta_impressions', align: 'right' },
  { key: 'clicks', label: 'CLICS', format: fNum, delta: 'delta_clicks', align: 'right' },
  { key: 'ctr', label: 'CTR', format: fCtr, delta: 'delta_ctr', align: 'right' },
  { key: 'spend', label: 'COÛT', format: fEurCompact, delta: 'delta_spend', align: 'right' },
  { key: 'cpc', label: 'CPC', format: fEur, delta: 'delta_cpc', align: 'right' },
  { key: 'conversions', label: 'CONV.', format: fNum, delta: 'delta_conversions', align: 'right' },
  { key: 'revenue', label: 'REVENUE', format: fEurCompact, delta: 'delta_revenue', align: 'right' },
  { key: 'cvr', label: 'CVR', format: fPct, delta: 'delta_cvr', align: 'right' },
  { key: 'roas', label: 'ROAS', format: fROAS, delta: 'delta_roas', align: 'right' },
];

function fCtr(v) {
  return v != null && !isNaN(v) ? v.toFixed(2) + '%' : '—';
}

function fDeltaVal(value) {
  if (value == null || isNaN(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return sign + value.toFixed(1) + '%';
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 xl:grid-cols-9 gap-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <div key={i} className="bg-white rounded-card p-4 border border-border shadow-card">
            <div className="skeleton h-16 w-full" />
          </div>
        ))}
      </div>
      <div className="bg-white rounded-card p-6 border border-border shadow-card">
        <div className="skeleton h-64 w-full" />
      </div>
    </div>
  );
}

export default function ComarketView({ filters }) {
  const [selectedBrand, setSelectedBrand] = useState('ALL');
  const [expandedBrands, setExpandedBrands] = useState([]);
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');

  const { data, isLoading } = useComarketData({
    from: filters.from,
    to: filters.to,
    compareTo: filters.compareTo,
    partnerBrand: selectedBrand,
  });

  if (isLoading || !data) return <Skeleton />;

  const { kpis, campaigns = [], brandSummary = [], availableBrands = [] } = data;
  const { current, previous, deltas, pctOfFR } = kpis;

  // ─── Grouping Logic (Now based on backend brandSummary) ───
  const brandsWithDetails = brandSummary.map((b) => {
    const brandCampaigns = campaigns.filter((c) => c.partner_brand === b.brand);
    return {
      ...b,
      label: b.brand,
      isBrand: true,
      campaigns: brandCampaigns,
    };
  });

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortCol(col);
      setSortDir('desc');
    }
  }

  function toggleExpand(brandName) {
    setExpandedBrands((prev) =>
      prev.includes(brandName) ? prev.filter((b) => b !== brandName) : [...prev, brandName]
    );
  }

  const sortedBrands = [...brandsWithDetails].sort((a, b) => {
    const va = a[sortCol] ?? '';
    const vb = b[sortCol] ?? '';
    if (typeof va === 'string')
      return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  return (
    <div className="space-y-4 text-navy">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Performance CoMarket</h2>
          <span className="text-[11px] font-medium px-2.5 py-1 rounded-[6px] bg-warning-bg text-warning border border-warning/10">
            FR uniquement
          </span>
        </div>

        <BrandSelector
          options={availableBrands}
          selected={selectedBrand}
          onSelect={setSelectedBrand}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 xl:grid-cols-9 gap-3">
        {KPI_CARDS.map((kpi) => {
          const value = current[kpi.key];
          const prevVal = previous[kpi.key];
          const delta = deltas[kpi.deltaKey];
          const isPos = delta > 0;
          const isNeg = delta < 0;
          return (
            <div
              key={kpi.key}
              className="bg-white rounded-card border border-border shadow-card overflow-hidden"
            >
              <div className="h-[3px]" style={{ background: kpi.accent }} />
              <div className="px-4 py-3">
                <p className="text-[10px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-1.5 truncate">
                  {kpi.label}
                </p>
                <p className="text-xl font-bold mb-1 leading-tight">{kpi.format(value)}</p>
                <p
                  className={`text-[11px] font-medium ${isPos ? 'text-success' : isNeg ? 'text-danger' : 'text-navy-muted'} mb-0.5`}
                >
                  {isPos ? '▲' : isNeg ? '▼' : ''} {fDeltaVal(delta)}
                </p>
                <p className="text-[11px] text-navy-muted">{kpi.format(prevVal)}</p>
                {(kpi.key === 'spend' || kpi.key === 'revenue') && pctOfFR && (
                  <p className="text-[10px] text-navy-muted mt-0.5 font-medium">
                    {pctOfFR[kpi.key]}% du total FR
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CostKpiChart
        filters={filters}
        onlyComarket={true}
        partnerBrand={selectedBrand}
        title={`Trend CoMarket ${selectedBrand !== 'ALL' ? `- ${selectedBrand}` : ''}`}
      />

      {/* Grouped Table */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        <div className="px-6 py-5 pb-3">
          <h3 className="text-lg font-semibold">Recapitulatif par Marque</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] table-fixed">
            <thead>
              <tr className="bg-bg-page border-b-2 border-border">
                {TABLE_COLS.map((col) => (
                  <th
                    key={col.key}
                    onClick={() => handleSort(col.key)}
                    style={{ width: col.minWidth || 'auto' }}
                    className={`px-3 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy select-none whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.label}
                    {sortCol === col.key && (
                      <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedBrands.map((brand, i) => {
                const isExpanded = expandedBrands.includes(brand.label);
                return (
                  <Fragment key={brand.label}>
                    <tr
                      className={`border-b border-border cursor-pointer transition-all duration-150 ${isExpanded ? 'bg-navy text-white' : i % 2 === 1 ? 'bg-[#FAFBFD]' : 'hover:bg-bg-page'}`}
                      onClick={() => toggleExpand(brand.label)}
                    >
                      {TABLE_COLS.map((col) => {
                        const val = brand[col.key];
                        const formatted = col.format ? col.format(val) : val;
                        const dVal = col.delta ? brand[col.delta] : null;
                        const isPos = dVal > 0;
                        const isNeg = dVal < 0;

                        if (col.key === 'label') {
                          return (
                            <td
                              key={col.key}
                              className="px-3 py-3 whitespace-nowrap text-left font-bold truncate"
                            >
                              <div className="flex items-center gap-2">
                                <svg
                                  className={`w-2.5 h-2.5 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-white/70' : 'text-navy-muted'}`}
                                  fill="currentColor"
                                  viewBox="0 0 20 20"
                                >
                                  <path d="M6 5l8 5-8 5V5z" />
                                </svg>
                                {val}
                                <span
                                  className={`ml-2 text-[9px] px-1.5 py-0.5 rounded-full font-bold tracking-wider ${isExpanded ? 'bg-white/20 text-white' : 'bg-navy/10 text-navy'}`}
                                >
                                  {brand.campaigns.length}
                                </span>
                              </div>
                            </td>
                          );
                        }

                        return (
                          <td key={col.key} className="px-3 py-3 whitespace-nowrap text-right">
                            <div className="font-bold">{formatted}</div>
                            {col.delta && dVal != null && (
                              <div
                                className={`text-[10px] font-semibold ${isExpanded ? 'text-white/70' : isPos ? 'text-success' : isNeg ? 'text-danger' : 'text-navy-muted'}`}
                              >
                                {isPos ? '▲' : isNeg ? '▼' : ''} {fDeltaVal(dVal)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {isExpanded &&
                      brand.campaigns.map((camp, ci) => (
                        <tr
                          key={`${brand.label}-camp-${ci}`}
                          className="border-b border-border bg-mint-bg/30 text-navy"
                        >
                          {TABLE_COLS.map((col) => {
                            let val = camp[col.key];
                            if (col.key === 'label') val = camp.campaign_name;

                            const formatted = col.format ? col.format(val) : val;
                            const dVal = col.delta ? camp[col.delta] : null;
                            const isPos = dVal > 0;
                            const isNeg = dVal < 0;

                            return (
                              <td
                                key={col.key}
                                className={`px-3 py-2.5 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left pl-8'}`}
                              >
                                <div
                                  className={
                                    col.key === 'label'
                                      ? 'text-[11px] truncate italic max-w-full font-medium'
                                      : 'font-medium'
                                  }
                                >
                                  {formatted}
                                </div>
                                {col.delta && dVal != null && (
                                  <div
                                    className={`text-[10px] font-semibold ${isPos ? 'text-success' : isNeg ? 'text-danger' : 'text-navy-muted'}`}
                                  >
                                    {isPos ? '▲' : isNeg ? '▼' : ''} {fDeltaVal(dVal)}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
              {sortedBrands.length === 0 && (
                <tr>
                  <td colSpan={TABLE_COLS.length} className="px-4 py-8 text-center text-navy-muted">
                    Aucune marque partenaire trouvee
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
