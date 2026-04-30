import { useQuery } from '@tanstack/react-query';
import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';
import { MarketLabel } from '../utils/flags';
import { fetchApi } from '../utils/api';
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
  { key: 'sessions', label: 'SESSIONS', format: fNum, align: 'right' },
  {
    key: 'delta_sessions',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
  },
  { key: 'bounce_rate', label: 'REBOND', format: fPct, align: 'right' },
  {
    key: 'delta_bounce_rate',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
    invert: true,
  },
  // ── Business ──
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
  { key: 'transactions', label: 'TRANS.', format: fNum, align: 'right' },
  {
    key: 'delta_transactions',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
  },
  { key: 'cvr', label: 'CVR', format: fPct, align: 'right' },
  { key: 'delta_cvr', label: 'Δ', format: (v) => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'aov', label: 'AOV', format: fAov, align: 'right' },
  { key: 'delta_aov', label: 'Δ', format: (v) => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'new_customer_pct', label: '% NOUV. CL.', format: fPct, align: 'right' },
  {
    key: 'delta_new_customer_pct',
    label: 'Δ',
    format: (v) => fDelta(v, 'pct'),
    align: 'right',
    isDelta: true,
  },
];

export default function GA4MarketTable({ filters, sourceMedium }) {
  const { data, isLoading } = useQuery({
    queryKey: [
      'ga4-market-summary',
      filters.brand,
      filters.from,
      filters.to,
      filters.compareTo,
      sourceMedium,
    ],
    queryFn: () => fetchApi('/api/ga4/markets-summary', { ...filters, sourceMedium }),
    staleTime: 15 * 60 * 1000,
  });

  // Hide ROAS columns when source is not Google CPC
  const filteredColumns = COLUMNS.filter((col) => {
    if (sourceMedium !== 'google / cpc' && (col.key === 'roas' || col.key === 'delta_roas'))
      return false;
    return true;
  });

  return (
    <DataTable
      title="Performance GA4 par marché"
      data={data}
      columns={filteredColumns}
      isLoading={isLoading}
      defaultSort="revenue"
      exportFilename="ga4-performance-marches.csv"
      rowKey={(row, i) => `${row.market}-${i}`}
    />
  );
}
