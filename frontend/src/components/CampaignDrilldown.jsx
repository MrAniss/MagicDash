import { useState } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useCampaigns } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';

const PIE_COLORS = ['#00B87A', '#378ADD', '#F5A623', '#E8524A', '#7F77DD', '#D4537E'];

const MARKETS = [
  { key: 'ALL', label: 'Tous' },
  { key: 'FR', label: 'FR' }, { key: 'BE', label: 'BE' }, { key: 'NL', label: 'NL' },
  { key: 'DE', label: 'DE' }, { key: 'IT', label: 'IT' }, { key: 'ES', label: 'ES' },
  { key: 'UK', label: 'UK' }, { key: 'AT', label: 'AT' }, { key: 'PT', label: 'PT' },
  { key: 'LU', label: 'LU' }, { key: 'SE', label: 'SE' }, { key: 'NO', label: 'NO' },
  { key: 'FI', label: 'FI' }, { key: 'PL', label: 'PL' }, { key: 'IE', label: 'IE' },
  { key: 'RO', label: 'RO' }, { key: 'SA', label: 'SA' }, { key: 'CA', label: 'CA' },
  { key: 'AU', label: 'AU' }, { key: 'US', label: 'US' },
];

const TABLE_COLS = [
  { key: 'campaign_name', label: 'CAMPAGNE', align: 'left', wide: true },
  { key: 'type', label: 'TYPE', align: 'left' },
  { key: 'status', label: 'STATUT', align: 'left' },
  { key: 'spend', label: 'SPEND', format: fEur, align: 'right' },
  { key: 'revenue', label: 'REVENUE', format: fEur, align: 'right' },
  { key: 'roas', label: 'ROAS', format: fROAS, align: 'right' },
  { key: 'conversions', label: 'CONV.', format: fNum, align: 'right' },
  { key: 'cvr', label: 'CVR', format: fPct, align: 'right' },
  { key: 'clicks', label: 'CLICS', format: fNum, align: 'right' },
  { key: 'ctr', label: 'CTR', format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', align: 'right' },
];

const TYPE_TABLE_COLS = [
  { key: 'type', label: 'TYPE', align: 'left' },
  { key: 'spend', label: 'SPEND', format: fEur, align: 'right' },
  { key: 'spend_pct', label: '% SPEND', format: v => v.toFixed(1) + '%', align: 'right' },
  { key: 'revenue', label: 'REVENUE', format: fEur, align: 'right' },
  { key: 'roas', label: 'ROAS', format: fROAS, align: 'right' },
  { key: 'conversions', label: 'CONV.', format: fNum, align: 'right' },
  { key: 'cvr', label: 'CVR', format: fPct, align: 'right' },
  { key: 'clicks', label: 'CLICS', format: fNum, align: 'right' },
  { key: 'ctr', label: 'CTR', format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', align: 'right' },
  { key: 'aov', label: 'AOV', format: fAov, align: 'right' },
  { key: 'delta_roas', label: '\u0394 ROAS', format: v => fDelta(v, 'abs'), align: 'right', isDelta: true },
  { key: 'delta_spend', label: '\u0394 SPEND', format: v => fDelta(v, 'pct'), align: 'right', isDelta: true },
  { key: 'delta_aov', label: '\u0394 AOV', format: v => v != null && !isNaN(v) ? `${v > 0 ? '+' : ''}${v.toFixed(2)} \u20AC` : '\u2014', align: 'right', isDelta: true },
];

function Skeleton() {
  return (
    <div className="bg-white rounded-card p-6 border border-border shadow-card">
      <div className="skeleton h-4 w-40 mb-4" />
      {Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-8 w-full mb-2" />)}
    </div>
  );
}

function deltaColor(v) {
  if (v > 0) return 'text-success';
  if (v < 0) return 'text-danger';
  return 'text-navy-muted';
}

export default function CampaignDrilldown({ filters }) {
  const [market, setMarket] = useState('ALL');
  const [activeType, setActiveType] = useState(null);
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedCampaigns, setSelectedCampaigns] = useState([]);

  const { data, isLoading } = useCampaigns({
    brand: filters.brand,
    market,
    from: filters.from,
    to: filters.to,
    type: 'ALL',
    compareTo: filters.compareTo,
  });

  if (isLoading || !data) return <Skeleton />;

  const { campaigns = [], typeSummary = [] } = data;
  const filteredCampaigns = activeType ? campaigns.filter(c => c.type === activeType) : campaigns;

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  }

  const sorted = [...filteredCampaigns].sort((a, b) => {
    const va = a[sortCol] ?? '';
    const vb = b[sortCol] ?? '';
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const pieData = typeSummary.map(t => ({ name: t.type, value: t.spend }));

  function handlePieClick(typeName) {
    setActiveType(prev => prev === typeName ? null : typeName);
  }

  function toggleCampaign(name) {
    setSelectedCampaigns(prev => {
      if (prev.includes(name)) return prev.filter(n => n !== name);
      if (prev.length >= 5) return prev;
      return [...prev, name];
    });
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-card p-4 border border-border shadow-card flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy-muted font-medium">Marche:</span>
          <select value={market} onChange={e => setMarket(e.target.value)}
            className="bg-bg-page border border-border rounded-inner px-2 py-1 text-xs text-navy font-medium focus:border-navy outline-none">
            {MARKETS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </div>
        {activeType && (
          <span className="text-xs text-navy flex items-center gap-1.5">
            Filtre: <strong>{activeType}</strong>
            <button onClick={() => setActiveType(null)} className="text-navy-muted hover:text-navy ml-1 text-sm">&#10005;</button>
          </span>
        )}
      </div>

      {/* Type summary + Donut */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white rounded-card border border-border shadow-card overflow-hidden">
          <div className="px-6 py-5 pb-3">
            <h3 className="text-lg font-semibold text-navy">Recap par type</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-bg-page border-b-2 border-border">
                  {TYPE_TABLE_COLS.map(col => (
                    <th key={col.key} className={`px-3 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {typeSummary.map((row, i) => (
                  <tr key={row.type} className={`border-b border-border cursor-pointer transition-colors group ${activeType === row.type ? 'bg-mint-bg' : i % 2 === 1 ? 'bg-[#FAFBFD]' : 'hover:bg-navy hover:text-white'}`}
                    onClick={() => handlePieClick(row.type)}>
                    {TYPE_TABLE_COLS.map(col => {
                      const val = row[col.key];
                      const formatted = col.format ? col.format(val) : val;
                      let cls = `px-3 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                      if (col.isDelta) cls += ' text-xs font-medium ' + deltaColor(val) + ' group-hover:text-white';
                      else if (col.key === 'roas') cls += ' font-medium ' + (val >= 4 ? ' text-success' : val >= 2.5 ? ' text-warning' : ' text-danger') + ' group-hover:text-white';
                      else if (col.key === 'type') cls += ' font-medium text-navy group-hover:text-white';
                      else cls += ' text-navy group-hover:text-white';
                      return <td key={col.key} className={cls}>{formatted}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-white rounded-card p-6 border border-border shadow-card">
          <h3 className="text-lg font-semibold text-navy mb-4">Repartition spend</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={80} paddingAngle={2}
                  onClick={(_, idx) => handlePieClick(pieData[idx].name)}>
                  {pieData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}
                      stroke={activeType === entry.name ? '#1A2E4A' : 'transparent'} strokeWidth={activeType === entry.name ? 2 : 0} />
                  ))}
                </Pie>
                <Tooltip formatter={v => fEur(v)} contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(26,46,74,0.15)', borderRadius: 12, fontSize: 11, color: '#1A2E4A' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-navy-muted text-xs py-16 text-center">Pas de donnees</p>}
          <div className="flex flex-wrap gap-2 justify-center mt-2">
            {pieData.map((d, i) => (
              <button key={d.name} onClick={() => handlePieClick(d.name)}
                className={`flex items-center gap-1.5 px-2 py-0.5 rounded-inner text-[10px] font-medium transition-colors ${activeType === d.name ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                <div className="w-2 h-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Campaign table */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        <div className="px-6 py-5 pb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-navy">{sorted.length} Campagnes</h3>
          {selectedCampaigns.length > 0 && (
            <span className="text-[11px] text-navy-muted">{selectedCampaigns.length}/5 selectionnees pour comparaison ROAS</span>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-bg-page border-b-2 border-border">
                <th className="px-2 py-3 w-8"><span className="sr-only">Select</span></th>
                {TABLE_COLS.map(col => (
                  <th key={col.key} onClick={() => handleSort(col.key)}
                    className={`px-3 py-3 text-[11px] font-semibold text-navy-muted uppercase tracking-[0.06em] cursor-pointer hover:text-navy transition-colors select-none whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {col.label}
                    {sortCol === col.key && <span className="ml-1">{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row, i) => {
                const isSelected = selectedCampaigns.includes(row.campaign_name);
                return (
                  <tr key={i} className={`border-b border-border hover:bg-navy hover:text-white transition-colors group ${isSelected ? 'bg-mint-bg' : i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                    <td className="px-2 py-2.5">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleCampaign(row.campaign_name)}
                        disabled={!isSelected && selectedCampaigns.length >= 5} className="w-3.5 h-3.5 rounded accent-navy" />
                    </td>
                    {TABLE_COLS.map(col => {
                      const val = row[col.key];
                      const formatted = col.format ? col.format(val) : val;
                      let cls = `px-3 py-2.5 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                      if (col.key === 'roas') cls += ' font-medium ' + (val >= 4 ? 'text-success' : val >= 2.5 ? 'text-warning' : 'text-danger') + ' group-hover:text-white';
                      else if (col.key === 'status') {
                        cls += val === 'ENABLED' ? ' text-success' : ' text-navy-muted';
                        return <td key={col.key} className={cls + ' group-hover:text-white'}>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-[6px] ${val === 'ENABLED' ? 'bg-success-bg text-success' : 'bg-bg-page text-navy-muted'}`}>
                            {val === 'ENABLED' ? 'Active' : 'Pausee'}
                          </span>
                        </td>;
                      }
                      else if (col.wide) cls += ' text-navy max-w-[300px] truncate group-hover:text-white';
                      else cls += ' text-navy group-hover:text-white';
                      return <td key={col.key} className={cls} title={col.wide ? val : undefined}>{formatted}</td>;
                    })}
                  </tr>
                );
              })}
              {sorted.length === 0 && (
                <tr><td colSpan={TABLE_COLS.length + 1} className="px-4 py-8 text-center text-navy-muted">Aucune campagne trouvee</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
