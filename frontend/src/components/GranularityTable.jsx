import { useState } from 'react';
import { useGranularity } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';
import DataTable from './DataTable';

const GRAN_OPTIONS = [
  { key: 'day', label: 'Jour' },
  { key: 'week', label: 'Semaine' },
  { key: 'month', label: 'Mois' },
];

const COLS = [
  { key: 'period', label: 'PERIODE', align: 'left', bold: true },
  // ── Trafic ──
  { key: 'impressions', label: 'IMPR.', format: fNum, align: 'right' },
  {
    key: 'delta_impressions',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
  },
  { key: 'clicks', label: 'CLICS', format: fNum, align: 'right' },
  {
    key: 'delta_clicks',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
  },
  { key: 'cpc', label: 'CPC', format: (v) => fEur(v, true), align: 'right' },
  {
    key: 'delta_cpc',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
    invert: true,
  },
  {
    key: 'ctr',
    label: 'CTR',
    format: (v) => (v != null && !isNaN(v) ? v.toFixed(2) + '%' : '—'),
    align: 'right',
  },
  { key: 'delta_ctr', label: 'Δ', format: (v) => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'cvr', label: 'CVR', format: fPct, align: 'right' },
  { key: 'delta_cvr', label: 'Δ', format: (v) => fDelta(v, 'pct'), align: 'right', isDelta: true },
  // ── Business ──
  { key: 'spend', label: 'SPEND', format: fEur, align: 'right' },
  {
    key: 'delta_spend',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
  },
  { key: 'revenue', label: 'REVENUE', format: fEur, align: 'right' },
  {
    key: 'delta_revenue',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
  },
  { key: 'roas', label: 'ROAS', format: fROAS, align: 'right', colorCode: true },
  { key: 'delta_roas', label: 'Δ', format: (v) => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'conversions', label: 'CONV.', format: fNum, align: 'right' },
  {
    key: 'delta_conversions',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
  },
  { key: 'aov', label: 'AOV', format: fAov, align: 'right' },
  { key: 'delta_aov', label: 'Δ', format: (v) => fDelta(v, 'pct'), align: 'right', isDelta: true },
];

export default function GranularityTable({ filters }) {
  const [gran, setGran] = useState('day');

  const { data, isLoading } = useGranularity({
    brand: filters.brand,
    market: filters.market,
    from: filters.from,
    to: filters.to,
    compareTo: filters.compareTo,
    granularity: gran,
  });

  const granPicker = (
    <div className="flex bg-bg-page rounded-inner p-0.5">
      {GRAN_OPTIONS.map((g) => (
        <button
          key={g.key}
          onClick={() => setGran(g.key)}
          className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${gran === g.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}
        >
          {g.label}
        </button>
      ))}
    </div>
  );

  return (
    <DataTable
      title="Détail par période"
      data={data}
      columns={COLS}
      isLoading={isLoading}
      exportFilename={`detail-periode-${gran}.csv`}
      toolbarExtra={granPicker}
    />
  );
}
