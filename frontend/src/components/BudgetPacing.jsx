import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getCurrentMonth } from '../utils/dateHelpers';
import { fEur, fNum, fROAS, fAov, fDelta, fEurInt } from '../utils/formatters';
import { MarketLabel, marketName } from '../utils/flags';
import BudgetDailyChart from './BudgetDailyChart';
import { API_URL, authFetch } from '../utils/api';
import { useComarket } from '../contexts/ComarketContext';

const BRAND_OPTIONS = [
  { key: 'COCOONCENTER', label: 'Cocooncenter' },
  { key: 'PASCAL_COSTE', label: 'Pascal Coste Shopping' },
  { key: 'PARAPHARMACIE_LAFAYETTE', label: 'Parapharmacie Lafayette' },
];

const CC_MARKETS = [
  'ALL',
  'FR',
  'UK',
  'DE',
  'ES',
  'BE',
  'IT',
  'PL',
  'US',
  'AU',
  'CA',
  'SA',
  'Autres pays',
];
const PCS_MARKETS = ['ALL', 'FR'];

const COMPARE_OPTIONS = [
  { key: 'previous_month', label: 'M-1' },
  { key: 'previous_year', label: 'N-1' },
];

function getMarketsForBrand(brand) {
  const b = (brand || '').toUpperCase();
  if (b === 'COCOONCENTER') return CC_MARKETS;
  return PCS_MARKETS;
}

async function fetchBudget(brand, market, month, compareTo, includeComarket) {
  const url = new URL('/api/budget', API_URL || window.location.origin);
  url.searchParams.set('brand', brand);
  url.searchParams.set('market', market);
  url.searchParams.set('month', month);
  url.searchParams.set('compareTo', compareTo);
  url.searchParams.set('includeComarket', includeComarket);
  const res = await authFetch(url);
  if (!res.ok) throw new Error('Budget API error');
  return res.json();
}

function Skeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-card p-6 border border-border shadow-card">
        <div className="skeleton h-40 w-full" />
      </div>
      <div className="bg-white rounded-card p-6 border border-border shadow-card">
        <div className="skeleton h-64 w-full" />
      </div>
    </div>
  );
}

function GaugeCircle({ pct, title, sublabel, colorOverride, size = 150 }) {
  const radius = (size - 16) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = Math.min(Math.max(pct / 100, 0), 1.5);
  const offset = circumference - progress * circumference;

  let color = colorOverride || '#00B87A';
  if (!colorOverride) {
    if (pct > 115 || pct < 75) color = '#E8524A';
    else if (pct > 105) color = '#F5A623';
  }

  return (
    <div className="flex flex-col items-center">
      <p className="text-[11px] font-bold text-navy-muted uppercase tracking-wider mb-3">{title}</p>
      <div
        className="relative flex items-center justify-center"
        style={{ width: size, height: size }}
      >
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#E8EDF4"
            strokeWidth={10}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={10}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            className="transition-all duration-700"
          />
        </svg>
        <div className="absolute text-center px-4">
          <span className="text-2xl font-bold text-navy leading-none">{Math.round(pct)}%</span>
          <p className="text-[10px] text-navy-muted mt-1 leading-tight">{sublabel}</p>
        </div>
      </div>
    </div>
  );
}

function PacingBar({ spendToDate, theoreticalSpend, budget }) {
  const pctSpend = budget > 0 ? (spendToDate / budget) * 100 : 0;
  const pctTheoretical = budget > 0 ? (theoreticalSpend / budget) * 100 : 0;

  return (
    <div className="relative h-8 bg-bg-page rounded-full overflow-visible">
      <div
        className="absolute inset-y-0 left-0 rounded-full bg-mint-dark/80 transition-all duration-500"
        style={{ width: `${Math.min(pctSpend, 100)}%` }}
      />
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-navy/40 z-10"
        style={{ left: `${Math.min(pctTheoretical, 100)}%` }}
      >
        <div className="absolute -top-5 -translate-x-1/2 text-[9px] text-navy-muted whitespace-nowrap font-medium">
          Theorique
        </div>
      </div>
      <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] font-semibold">
        <span className="text-white z-10">{fEurInt(spendToDate)}</span>
        <span className="text-navy-muted">{fEurInt(budget)}</span>
      </div>
    </div>
  );
}

function statusBadge(status) {
  if (status === 'over')
    return (
      <span className="text-[11px] font-medium px-2.5 py-1 rounded-[6px] bg-danger-bg text-danger">
        Over-pacing
      </span>
    );
  if (status === 'under')
    return (
      <span className="text-[11px] font-medium px-2.5 py-1 rounded-[6px] bg-warning-bg text-warning">
        Under-pacing
      </span>
    );
  return (
    <span className="text-[11px] font-medium px-2.5 py-1 rounded-[6px] bg-success-bg text-success">
      On track
    </span>
  );
}

function ForecastCard({
  label,
  projBase,
  projOpt,
  projPess,
  compare,
  compareDelta,
  format,
  compareLabel,
}) {
  const hasProjRange = projOpt != null && projPess != null;
  const deltaColor =
    compareDelta > 0 ? 'text-success' : compareDelta < 0 ? 'text-danger' : 'text-navy-muted';
  const deltaArrow = compareDelta > 0 ? '\u25B2' : compareDelta < 0 ? '\u25BC' : '';

  return (
    <div className="bg-white rounded-card p-5 border border-border shadow-card">
      <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-3">
        {label}
      </p>
      <p className="text-2xl font-bold text-navy mb-3">{format(projBase)}</p>

      {hasProjRange && (
        <div className="space-y-1 mb-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-success">&#x1F4C8; Optimiste</span>
            <span className="font-medium text-success">{format(projOpt)}</span>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-danger">&#x1F4C9; Pessimiste</span>
            <span className="font-medium text-danger">{format(projPess)}</span>
          </div>
        </div>
      )}

      <div className="border-t border-border pt-3">
        <p className="text-[10px] text-navy-muted uppercase mb-1">vs {compareLabel}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs text-navy">{format(compare)}</span>
          <span className={`text-xs font-semibold ${deltaColor}`}>
            {deltaArrow} {fDelta(compareDelta)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function BudgetPacing({ filters }) {
  const [month, setMonth] = useState(getCurrentMonth());
  const [brand, setBrand] = useState(filters?.brand || 'COCOONCENTER');
  const [market, setMarket] = useState('ALL');
  const [compareTo, setCompareTo] = useState(
    () => localStorage.getItem('dhygietal_budget_compare') || 'previous_month'
  );
  const { includeComarket } = useComarket();

  // Sync with global filters if they change
  useEffect(() => {
    if (filters?.brand) setBrand(filters.brand);
  }, [filters?.brand]);

  const availableMarkets = getMarketsForBrand(brand);

  function handleCompareChange(val) {
    setCompareTo(val);
    localStorage.setItem('dhygietal_budget_compare', val);
  }

  const { data, isLoading } = useQuery({
    queryKey: ['budget', brand, market, month, compareTo, includeComarket],
    queryFn: () => fetchBudget(brand, market, month, compareTo, includeComarket),
    enabled: !!month,
    placeholderData: (prev) => prev,
  });

  const monthOptions = useMemo(() => {
    const opts = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      opts.push({ val, label });
    }
    return opts;
  }, []);

  function handleBrandChange(newBrand) {
    setBrand(newBrand);
    setMarket('ALL');
  }

  if (isLoading && !data) return <Skeleton />;
  if (!data) return null;

  const {
    days_elapsed,
    days_total,
    cost,
    revenue,
    roas,
    conversions,
    aov,
    budget,
    markets = [],
  } = data;
  const hasBudget = budget != null && budget > 0;
  const compareLabel = compareTo === 'previous_year' ? 'N-1' : 'M-1';
  const insufficientData = days_elapsed < 3;

  const theoreticalSpend = hasBudget ? (budget / days_total) * days_elapsed : 0;
  const pctConsumed = budget > 0 ? (cost.to_date / budget) * 100 : 0;
  const pctTime = (days_elapsed / days_total) * 100;

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-navy">Budget & Pacing</h2>
          <span
            className={`text-[11px] font-medium px-2.5 py-1 rounded-[6px] ${includeComarket ? 'bg-blue-50 text-blue-600' : 'bg-success-bg text-success'}`}
          >
            {includeComarket ? 'Comarket inclus' : 'Comarket exclu'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={brand}
            onChange={(e) => handleBrandChange(e.target.value)}
            className="bg-white border border-border rounded-inner px-3 py-2 text-xs text-navy font-medium focus:border-navy outline-none shadow-card"
          >
            {BRAND_OPTIONS.map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <select
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            className="bg-white border border-border rounded-inner px-3 py-2 text-xs text-navy font-medium focus:border-navy outline-none shadow-card"
          >
            {availableMarkets.map((m) => (
              <option key={m} value={m}>
                {m === 'ALL' ? 'Tous les marches' : marketName(m)}
              </option>
            ))}
          </select>
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="bg-white border border-border rounded-inner px-3 py-2 text-xs text-navy font-medium focus:border-navy outline-none shadow-card"
          >
            {monthOptions.map((m) => (
              <option key={m.val} value={m.val}>
                {m.label}
              </option>
            ))}
          </select>
          <div className="flex bg-bg-page rounded-inner p-0.5 ml-1">
            {COMPARE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => handleCompareChange(opt.key)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${compareTo === opt.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Budget pacing section (only if budget exists) */}
      {hasBudget && (
        <>
          <div className="bg-white rounded-card p-6 border border-border shadow-card">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold text-navy">
                {market !== 'ALL' ? (
                  <>
                    <MarketLabel market={market} showFullName />
                  </>
                ) : (
                  `Total ${brand}`
                )}{' '}
                — Jour {days_elapsed} / {days_total}
              </h3>
              {statusBadge(cost.status)}
            </div>
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-1">
                  Budget
                </p>
                <p className="text-xl font-bold text-navy">{fEurInt(budget)}</p>
              </div>
              <div>
                <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-1">
                  Depense a date
                </p>
                <p className="text-xl font-bold text-navy">{fEurInt(cost.to_date)}</p>
              </div>
            </div>
            <PacingBar
              spendToDate={cost.to_date}
              theoreticalSpend={theoreticalSpend}
              budget={budget}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-card p-6 border border-border shadow-card flex flex-col items-center justify-center">
              <div className="flex items-center justify-around w-full gap-4 mb-8 mt-2">
                <GaugeCircle
                  pct={pctConsumed}
                  title="Consommé"
                  sublabel="du budget total"
                  colorOverride={pctConsumed > pctTime ? '#F5A623' : '#00B87A'}
                />
                <GaugeCircle pct={cost.pacing_pct} title="Pacing" sublabel="vs théorique" />
              </div>

              <div className="w-full border-t border-border pt-5 flex items-center justify-between">
                <div className="text-center flex-1">
                  <p className="text-[10px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-1">
                    Budget consommé
                  </p>
                  <p className="text-xl font-bold text-navy">
                    {fEurInt(cost.to_date)} / {fEurInt(budget)}
                  </p>
                </div>
                <div className="w-px h-12 bg-border mx-2" />
                <div className="text-center flex-1">
                  <p className="text-[10px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-1">
                    Temps écoulé
                  </p>
                  <p className="text-xl font-bold text-navy">{pctTime.toFixed(1)}%</p>
                  <p className="text-[10px] text-navy-muted mt-0.5">
                    Jour {days_elapsed} / {days_total}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-card p-6 border border-border shadow-card flex flex-col">
              <h3 className="text-lg font-semibold text-navy mb-5">Projections cost fin de mois</h3>
              <div className="space-y-5 flex-1">
                {[
                  { label: 'Pessimiste (-15%)', value: cost.proj_pess, color: 'text-danger' },
                  { label: 'Base', value: cost.proj_base, color: 'text-navy' },
                  { label: 'Optimiste (+15%)', value: cost.proj_opt, color: 'text-success' },
                ].map((p) => (
                  <div key={p.label} className="flex items-center justify-between">
                    <span className="text-sm text-navy-muted">{p.label}</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-base font-semibold ${p.color}`}>
                        {fEurInt(p.value)}
                      </span>
                      {budget > 0 && (
                        <span
                          className={`text-[11px] font-medium px-2 py-0.5 rounded-[6px] ${p.value > budget ? 'bg-danger-bg text-danger' : 'bg-success-bg text-success'}`}
                        >
                          {p.value > budget ? 'Over' : 'Under'}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Visual comparison chart */}
              <div className="mt-8 pt-5 border-t border-border space-y-4">
                {[
                  { label: 'Budget', value: budget, color: '#1A2E4A', opacity: 1 },
                  { label: 'Projeté', value: cost.proj_base, color: '#00B87A', opacity: 1 },
                  {
                    label: `Réel ${compareLabel}`,
                    value: cost.compare,
                    color: '#8896B0',
                    opacity: 0.6,
                  },
                ]
                  .filter((d) => d.value > 0)
                  .map((d) => {
                    const maxVal = Math.max(budget, cost.proj_base, cost.compare);
                    const widthPct = (d.value / maxVal) * 100;
                    return (
                      <div key={d.label} className="space-y-1">
                        <div className="flex justify-between text-[10px] uppercase font-bold text-navy-muted tracking-wider">
                          <span>{d.label}</span>
                          <span>{fEurInt(d.value)}</span>
                        </div>
                        <div className="h-2 bg-bg-page rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-1000"
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: d.color,
                              opacity: d.opacity,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </div>

          {/* Daily pacing cards */}
          {days_elapsed > 0 && (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white rounded-card p-5 border border-border shadow-card">
                <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-3">
                  Spend moyen / jour
                </p>
                <p className="text-2xl font-bold text-navy mb-2">{fEur(data.daily_actual, true)}</p>
                {data.daily_target > 0 &&
                  (() => {
                    const delta = data.daily_delta;
                    const isOver = delta > 0;
                    const color = isOver ? 'text-success' : 'text-danger';
                    const arrow = isOver ? '\u25B2' : '\u25BC';
                    return (
                      <p className={`text-xs font-medium ${color}`}>
                        {arrow} {isOver ? '+' : ''}
                        {fEur(Math.abs(delta), true)} vs cible
                      </p>
                    );
                  })()}
              </div>
              <div className="bg-white rounded-card p-5 border border-border shadow-card">
                <p className="text-[11px] uppercase text-navy-muted font-medium tracking-[0.06em] mb-1">
                  Spend cible / jour
                </p>
                <p className="text-[10px] text-navy-muted mb-3">pour atterrir sur le budget</p>
                {days_total - days_elapsed > 0 ? (
                  <>
                    <p className="text-2xl font-bold text-mint-dark mb-2">
                      {fEur(data.daily_target, true)}
                    </p>
                    <p className="text-xs text-navy-muted">
                      sur les {days_total - days_elapsed} jours restants
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-navy-muted">Dernier jour du mois</p>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {budget === null && (
        <div className="bg-warning-bg border border-warning/20 rounded-card px-4 py-3 text-xs text-warning font-medium flex items-center gap-2">
          <span>&#9888;</span>
          <span>Aucun budget Sheet disponible pour {brand}.</span>
        </div>
      )}

      {/* Forecast section — always shown */}
      {insufficientData ? (
        <div className="bg-bg-card2 border border-border rounded-card px-4 py-3 text-xs text-navy-muted font-medium">
          Donnees insuffisantes (moins de 3 jours ecoules) pour projeter les performances.
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold text-navy">Forecast atterrissage fin de mois</h3>
          <div className="grid grid-cols-4 gap-4">
            <ForecastCard
              label="Revenue"
              projBase={revenue.proj_base}
              projOpt={revenue.proj_opt}
              projPess={revenue.proj_pess}
              compare={revenue.compare}
              compareDelta={revenue.compare_delta}
              format={fEur}
              compareLabel={compareLabel}
            />
            <ForecastCard
              label="ROAS"
              projBase={roas.proj_base}
              projOpt={null}
              projPess={null}
              compare={roas.compare}
              compareDelta={roas.compare_delta}
              format={fROAS}
              compareLabel={compareLabel}
            />
            <ForecastCard
              label="Conversions"
              projBase={conversions.proj_base}
              projOpt={conversions.proj_opt}
              projPess={conversions.proj_pess}
              compare={conversions.compare}
              compareDelta={conversions.compare_delta}
              format={fNum}
              compareLabel={compareLabel}
            />
            <ForecastCard
              label="Panier moyen"
              projBase={aov.proj_base}
              projOpt={null}
              projPess={null}
              compare={aov.compare}
              compareDelta={aov.compare_delta}
              format={fAov}
              compareLabel={compareLabel}
            />
          </div>
        </div>
      )}

      {/* Daily spend chart */}
      <BudgetDailyChart brand={brand} market={market} />

      {/* Per-market table */}
      {markets.length > 0 && (
        <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
          <div className="px-6 py-5 pb-3">
            <h3 className="text-lg font-semibold text-navy">Detail par marche</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-bg-page border-b-2 border-border">
                  <th className="px-4 py-3 text-left text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                    MARCHE
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                    BUDGET
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                    DEPENSE
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                    PACING
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                    PROJECTION
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                    MOY/JOUR
                  </th>
                  <th className="px-4 py-3 text-right text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                    CIBLE/JOUR
                  </th>
                  <th className="px-4 py-3 text-center text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em]">
                    STATUS
                  </th>
                </tr>
              </thead>
              <tbody>
                {markets.map((m, i) => (
                  <tr
                    key={m.market}
                    className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${i % 2 === 1 ? 'bg-[#FAFBFD]' : ''} ${m.isGuest ? 'bg-[#F0F4FF]' : ''}`}
                  >
                    <td className="px-4 py-3 text-navy font-medium group-hover:text-white">
                      {m.market === 'France Para Laf' ? (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <img
                            src="https://flagcdn.com/w40/fr.png"
                            srcSet="https://flagcdn.com/w80/fr.png 2x"
                            width={16}
                            height={12}
                            alt="FR"
                            style={{
                              display: 'inline-block',
                              verticalAlign: 'middle',
                              borderRadius: 2,
                            }}
                          />
                          <span>France Para Laf</span>
                        </span>
                      ) : (
                        <MarketLabel market={m.market} showFullName />
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {m.budget > 0 ? fEurInt(m.budget) : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {fEurInt(m.spend_to_date)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold group-hover:text-white ${m.budget > 0 ? (m.pacing_pct > 105 ? 'text-danger' : m.pacing_pct < 85 ? 'text-warning' : 'text-success') : 'text-navy-muted'}`}
                    >
                      {m.budget > 0 ? m.pacing_pct.toFixed(1) + '%' : '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {fEurInt(m.projection_base)}
                    </td>
                    <td className="px-4 py-3 text-right text-navy group-hover:text-white">
                      {fEur(m.daily_actual, true)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-semibold group-hover:text-white ${m.budget > 0 ? (m.daily_delta >= 0 ? 'text-success' : 'text-danger') : 'text-navy-muted'}`}
                    >
                      {m.budget > 0 && m.daily_target > 0 ? fEur(m.daily_target, true) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {m.budget > 0 ? (
                        statusBadge(m.status)
                      ) : (
                        <span className="text-[11px] text-navy-muted">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
