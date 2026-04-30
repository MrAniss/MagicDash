import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';
import { MarketLabel } from '../utils/flags';
import DataTable from './DataTable';

const COLUMNS = [
  {
    key: 'label',
    label: 'MARCHE',
    align: 'left',
    bold: true,
    render: (row) => <MarketLabel market={row.market || row.label} showFullName />,
  },
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
  { key: 'aov', label: 'PANIER MOY.', format: fAov, align: 'right' },
  { key: 'delta_aov', label: 'Δ', format: (v) => fDelta(v, 'pct'), align: 'right', isDelta: true },
];

export default function MarketTable({ data, isLoading }) {
  return (
    <DataTable
      title="Performance par marché"
      data={data}
      columns={COLUMNS}
      isLoading={isLoading}
      defaultSort="spend"
      exportFilename="performance-marches.csv"
      rowKey={(row, i) => `${row.market}-${i}`}
    />
  );
}
