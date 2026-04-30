import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { fEur } from '../utils/formatters';
import { marketName } from '../utils/flags';
import { API_URL } from '../utils/api';
import { useComarket } from '../contexts/ComarketContext';
import { CHART } from '../utils/chartColors';

const BRAND_OPTIONS = [
  { key: 'COCOONCENTER', label: 'Cocooncenter' },
  { key: 'PASCAL_COSTE', label: 'Pascal Coste Shopping' },
  { key: 'PARAPHARMACIE_LAFAYETTE', label: 'Parapharmacie Lafayette' },
];

const CC_MARKETS = [
  'ALL',
  'FR',
  'France Para Laf',
  'BE',
  'NL',
  'DE',
  'IT',
  'ES',
  'UK',
  'AT',
  'PT',
  'LU',
  'SE',
  'NO',
  'FI',
  'PL',
  'IE',
  'RO',
  'SA',
  'CA',
  'AU',
  'US',
];
const PCS_MARKETS = ['ALL', 'FR'];

function getMarketsForBrand(brand) {
  const b = (brand || '').toUpperCase();
  if (b === 'COCOONCENTER') return CC_MARKETS;
  return PCS_MARKETS;
}

function getYears() {
  const current = new Date().getFullYear();
  return [current, current - 1, current - 2];
}

async function fetchDailySpend(brand, market, year, includeComarket) {
  const url = new URL('/api/budget/daily-spend', API_URL || window.location.origin);
  url.searchParams.set('brand', brand);
  url.searchParams.set('market', market);
  url.searchParams.set('year', year);
  url.searchParams.set('includeComarket', includeComarket);
  const res = await fetch(url);
  if (!res.ok) throw new Error('Daily spend API error');
  return res.json();
}

// Format date label: "2026-01-15" → "15 jan"
function fDateLabel(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function fDateFull(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Custom tooltip
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const data = payload[0]?.payload;
  if (!data) return null;

  return (
    <div className="bg-white border border-border rounded-card shadow-card px-4 py-3 text-xs min-w-[200px]">
      <p className="font-semibold text-navy mb-2">{fDateFull(data.date)}</p>
      {payload.map((p, i) => {
        if (p.dataKey === 'gap') return null;
        return (
          <div key={i} className="flex items-center justify-between gap-4 mb-1">
            <span className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ background: p.color }}
              />
              <span className="text-navy-muted">{p.name}</span>
            </span>
            <span className="font-medium text-navy">{fEur(p.value)}</span>
          </div>
        );
      })}
      {data.ecart != null && (
        <div
          className={`mt-2 pt-2 border-t border-border flex items-center justify-between ${data.ecart >= 0 ? 'text-success' : 'text-danger'}`}
        >
          <span>Écart</span>
          <span className="font-semibold">
            {data.ecart >= 0 ? '+' : ''}
            {fEur(data.ecart)}
          </span>
        </div>
      )}
      {data.cumul_mtd != null && (
        <div className="flex items-center justify-between text-navy-muted mt-1">
          <span>Cumul MTD</span>
          <span className="font-medium text-navy">{fEur(data.cumul_mtd)}</span>
        </div>
      )}
      {data.budget_month != null && data.budget_month > 0 && (
        <div className="flex items-center justify-between text-navy-muted">
          <span>Budget mois</span>
          <span className="font-medium text-navy">{fEur(data.budget_month)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Main component ────────────────────────────────────

export default function BudgetDailyChart({ brand: propsBrand, market: propsMarket }) {
  const currentYear = new Date().getFullYear();
  const [brand, setBrand] = useState(propsBrand || 'COCOONCENTER');
  const [market, setMarket] = useState(propsMarket || 'ALL');
  const [year, setYear] = useState(currentYear);
  const years = getYears();

  // Sync if props change
  useEffect(() => {
    if (propsBrand) setBrand(propsBrand);
    if (propsMarket) setMarket(propsMarket);
  }, [propsBrand, propsMarket]);

  const availableMarkets = getMarketsForBrand(brand);
  const { includeComarket } = useComarket();

  const { data: rawData = [], isLoading } = useQuery({
    queryKey: ['budget-daily-spend', brand, market, year, includeComarket],
    queryFn: () => fetchDailySpend(brand, market, year, includeComarket),
    staleTime: 60 * 60 * 1000,
    placeholderData: (prev) => prev,
  });

  function handleBrandChange(newBrand) {
    setBrand(newBrand);
    setMarket('ALL');
  }

  // ── Build chart data ──────────────────────────────────
  const { chartData } = useMemo(() => {
    if (!rawData.length) return { chartData: [] };

    // Aggregate all markets into a single spend line + target line
    const byDate = {};
    for (const row of rawData) {
      if (!byDate[row.date]) {
        byDate[row.date] = { date: row.date, spend: 0, target: 0, budget_month: 0 };
      }
      byDate[row.date].spend += row.spend;
      byDate[row.date].target += row.budget_daily_target;
      byDate[row.date].budget_month +=
        row.budget_daily_target > 0
          ? row.budget_daily_target *
            new Date(row.date.slice(0, 4), parseInt(row.date.slice(5, 7)), 0).getDate()
          : 0;
    }

    let monthCumul = 0;
    let currentMonth = '';
    const sorted = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date));
    for (const d of sorted) {
      const m = d.date.slice(0, 7);
      if (m !== currentMonth) {
        monthCumul = 0;
        currentMonth = m;
      }
      monthCumul += d.spend;
      d.cumul_mtd = Math.round(monthCumul * 100) / 100;
      d.ecart = d.target > 0 ? Math.round((d.spend - d.target) * 100) / 100 : null;
    }

    const points = sorted.length;
    const skipEvery = points > 120 ? 14 : points > 60 ? 7 : points > 30 ? 2 : 1;
    sorted.forEach((d, i) => {
      d._label = i % skipEvery === 0 ? fDateLabel(d.date) : '';
    });

    return { chartData: sorted };
  }, [rawData]);

  // Today marker
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="bg-white rounded-card border border-border shadow-card p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-base font-semibold text-navy">Spend journalier</h3>
          <p className="text-[11px] text-navy-muted mt-0.5">
            Rythme de dépense quotidien vs cible budget
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={brand}
            onChange={(e) => handleBrandChange(e.target.value)}
            className="bg-bg-page border border-border rounded-inner px-2.5 py-1.5 text-xs text-navy font-medium focus:border-navy outline-none"
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
            className="bg-bg-page border border-border rounded-inner px-2.5 py-1.5 text-xs text-navy font-medium focus:border-navy outline-none"
          >
            {availableMarkets.map((m) => (
              <option key={m} value={m}>
                {m === 'ALL'
                  ? 'Tous les marchés'
                  : m === 'France Para Laf'
                    ? 'France Para Laf'
                    : marketName(m)}
              </option>
            ))}
          </select>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="bg-bg-page border border-border rounded-inner px-2.5 py-1.5 text-xs text-navy font-medium focus:border-navy outline-none"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Chart */}
      {isLoading ? (
        <div className="h-64 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-navy/20 border-t-navy rounded-full animate-spin" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="h-64 flex items-center justify-center text-sm text-navy-muted">
          Aucune donnée disponible pour cette période
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF4" vertical={false} />
            <XAxis
              dataKey="_label"
              tick={{ fontSize: 10, fill: '#8896B0' }}
              axisLine={false}
              tickLine={false}
              interval={0}
            />
            <YAxis
              tick={{ fontSize: 10, fill: '#8896B0' }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k€` : `${v}€`)}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />

            <>
              {/* Under-pace fill (spend < target → red tint) */}
              <Area
                dataKey="target"
                fill="#FEF2F2"
                stroke="none"
                legendType="none"
                isAnimationActive={false}
              />
              {/* Over-pace fill (spend > target → green tint) overlaid */}
              <Area
                dataKey="spend"
                fill="#F0FDF4"
                stroke="none"
                fillOpacity={0.7}
                legendType="none"
                isAnimationActive={false}
              />
              {/* Target dashed line */}
              <Line
                dataKey="target"
                name="Cible /jour"
                stroke="#00B87A"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                isAnimationActive={false}
              />
              {/* Actual spend line */}
              <Line
                dataKey="spend"
                name="Spend réel"
                stroke="#1A2E4A"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: '#1A2E4A' }}
                isAnimationActive={false}
              />
              <Legend
                wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                formatter={(v) => <span className="text-navy-muted">{v}</span>}
              />
            </>

            {/* Today marker */}
            {chartData.some((d) => d.date === todayStr) && (
              <ReferenceLine
                x={chartData.find((d) => d.date === todayStr)?._label || ''}
                stroke={CHART.navyMuted}
                strokeDasharray="3 3"
                label={{ value: 'Auj.', position: 'top', fontSize: 9, fill: CHART.navyMuted }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
