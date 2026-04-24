import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useCampaigns } from '../hooks/useAdsData';
import { fEur, fNum, fPct, fROAS, fDelta, fAov } from '../utils/formatters';
import { downloadCsv, copyTsv } from '../utils/exportTable';

const PIE_COLORS = ['#00B87A', '#378ADD', '#F5A623', '#E8524A', '#7F77DD', '#D4537E'];

function ExportButtons({ onCsv, onSheets, copied }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onCsv}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-inner bg-bg-page text-navy-muted hover:text-navy hover:bg-border transition-colors"
        title="Télécharger en CSV (Excel)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <path d="M8 11L3 6h3V1h4v5h3L8 11z" fill="currentColor"/>
          <path d="M1 13h14v2H1v-2z" fill="currentColor"/>
        </svg>
        CSV
      </button>
      <button onClick={onSheets}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-inner bg-bg-page text-navy-muted hover:text-navy hover:bg-border transition-colors"
        title="Copier pour Google Sheets (Ctrl+V dans une cellule)">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0">
          <rect x="1" y="1" width="14" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" fill="none"/>
          <path d="M1 5h14M1 9h14M1 13h14M5 1v14M11 1v14" stroke="currentColor" strokeWidth="1"/>
        </svg>
        {copied ? 'Copié !' : 'Sheets'}
      </button>
    </div>
  );
}

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
  { key: 'impressionShare', label: 'IMPR. SHARE', format: fPct, align: 'right', hasDelta: true, isPct: true },
  { key: 'impressions', label: 'IMPR.', format: fNum, align: 'right', hasDelta: true },
  { key: 'clicks', label: 'CLICS', format: fNum, align: 'right', hasDelta: true },
  { key: 'ctr', label: 'CTR', format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', align: 'right', hasDelta: true, isPct: true },
  { key: 'spend', label: 'SPEND', format: fEur, align: 'right', hasDelta: true },
  { key: 'cpc', label: 'CPC', format: fEur, align: 'right', hasDelta: true },
  { key: 'conversions', label: 'CONV.', format: fNum, align: 'right', hasDelta: true },
  { key: 'revenue', label: 'REVENUE', format: fEur, align: 'right', hasDelta: true },
  { key: 'cvr', label: 'CVR', format: fPct, align: 'right', hasDelta: true, isPct: true },
  { key: 'aov', label: 'AOV', format: fAov, align: 'right', hasDelta: true },
  { key: 'roas', label: 'ROAS', format: fROAS, align: 'right', hasDelta: true },
  { key: 'rankLostShare', label: 'LOST RANK', format: fPct, align: 'right', hasDelta: true, isPct: true },
  { key: 'budgetLostShare', label: 'LOST BUDGET', format: fPct, align: 'right', hasDelta: true, isPct: true },
];

const TYPE_TABLE_COLS = [
  { key: 'type', label: 'TYPE', align: 'left' },
  { key: 'impressions', label: 'IMPR.', format: fNum, align: 'right', hasDelta: true },
  { key: 'clicks', label: 'CLICS', format: fNum, align: 'right', hasDelta: true },
  { key: 'ctr', label: 'CTR', format: v => v != null && !isNaN(v) ? v.toFixed(2) + '%' : '\u2014', align: 'right', hasDelta: true, isPct: true },
  { key: 'spend', label: 'SPEND', format: fEur, align: 'right', hasDelta: true },
  { key: 'cpc', label: 'CPC', format: fEur, align: 'right', hasDelta: true },
  { key: 'conversions', label: 'CONV.', format: fNum, align: 'right', hasDelta: true },
  { key: 'revenue', label: 'REVENUE', format: fEur, align: 'right', hasDelta: true },
  { key: 'cvr', label: 'CVR', format: fPct, align: 'right', hasDelta: true, isPct: true },
  { key: 'aov', label: 'AOV', format: fAov, align: 'right', hasDelta: true },
  { key: 'roas', label: 'ROAS', format: fROAS, align: 'right', hasDelta: true },
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

function TypeBadge({ type, color }) {
  const shortName = type === 'Performance Max' ? 'PMAX' : type;
  return (
    <span 
      className="text-[9px] px-1.5 py-0.5 rounded-sm font-bold uppercase tracking-wider mr-2 border transition-colors"
      style={{ 
        backgroundColor: color ? `${color}15` : '#F1F5F9', 
        color: color || '#475569',
        borderColor: color ? `${color}30` : '#E2E8F0'
      }}
    >
      {shortName}
    </span>
  );
}

export default function CampaignDrilldown({ filters }) {
  const [activeType, setActiveType] = useState(null);
  const [sortCol, setSortCol] = useState('spend');
  const [sortDir, setSortDir] = useState('desc');
  const [selectedCampaigns, setSelectedCampaigns] = useState([]);
  const [copiedType, setCopiedType] = useState(false);
  const [copiedCamps, setCopiedCamps] = useState(false);

  const { data, isLoading } = useCampaigns({
    brand: filters.brand,
    market: filters.market,
    from: filters.from,
    to: filters.to,
    type: 'ALL',
    compareTo: filters.compareTo,
  });

  if (isLoading || !data) return <Skeleton />;

  const { campaigns = [], typeSummary = [] } = data;

  const typeColors = {};
  typeSummary.forEach((t, i) => {
    typeColors[t.type] = PIE_COLORS[i % PIE_COLORS.length];
  });

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

  const pieSpendData = typeSummary.map(t => ({ name: t.type, value: t.spend }));
  const pieRevenueData = typeSummary.map(t => ({ name: t.type, value: t.revenue }));

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
      {/* Filters summary if activeType */}
      {activeType && (
        <div className="bg-white rounded-card p-4 border border-border shadow-card flex items-center gap-4 flex-wrap">
          <span className="text-xs text-navy flex items-center gap-1.5">
            Filtre type: <strong>{activeType}</strong>
            <button onClick={() => setActiveType(null)} className="text-navy-muted hover:text-navy ml-1 text-sm">&#10005;</button>
          </span>
        </div>
      )}

      {/* Type summary Table - Full Width */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        <div className="px-6 py-5 pb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-navy">Recap par type</h3>
          <ExportButtons 
            onCsv={() => downloadCsv(TYPE_TABLE_COLS, typeSummary, 'recap-types.csv')}
            onSheets={async () => { await copyTsv(TYPE_TABLE_COLS, typeSummary); setCopiedType(true); setTimeout(() => setCopiedType(false), 2000); }}
            copied={copiedType}
          />
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
              {typeSummary.map((row, i) => {
                const isSelected = activeType === row.type;
                return (
                  <tr key={row.type} 
                    className={`border-b border-border cursor-pointer transition-colors group ${
                      isSelected 
                        ? 'bg-mint-bg text-navy' 
                        : 'hover:bg-navy hover:text-white ' + (i % 2 === 1 ? 'bg-[#FAFBFD]' : 'bg-white')
                    }`}
                    onClick={() => handlePieClick(row.type)}>
                    {TYPE_TABLE_COLS.map(col => {
                      const val = row[col.key];
                      const formatted = col.format ? col.format(val) : val;
                      let cls = `px-3 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                      
                      const deltaVal = row[`delta_${col.key}`];

                      if (col.key === 'roas') {
                        cls += ' font-bold ' + (val >= 4 ? 'text-success' : val >= 2.5 ? 'text-warning' : 'text-danger');
                        if (!isSelected) cls += ' group-hover:text-white';
                      } else if (col.key === 'type') {
                        cls += ' font-medium';
                        if (!isSelected) cls += ' text-navy group-hover:text-white';
                      } else {
                        if (!isSelected) cls += ' text-navy group-hover:text-white';
                      }
                      
                      return (
                        <td key={col.key} className={cls}>
                          <div className={col.align === 'right' ? 'flex flex-col items-end' : ''}>
                            <span className="leading-tight">{formatted}</span>
                            {col.hasDelta && deltaVal !== undefined && (
                              <span className={`text-[10px] font-medium ${isSelected ? deltaColor(deltaVal) : `group-hover:text-white ${deltaColor(deltaVal)}`} leading-tight`}>
                                {deltaVal > 0 ? '▲' : deltaVal < 0 ? '▼' : ''} {Math.abs(deltaVal).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-3 gap-4">
        {/* Spent Donut */}
        <div className="bg-white rounded-card p-6 border border-border shadow-card">
          <h3 className="text-[11px] font-semibold text-navy-muted uppercase tracking-wider mb-4 text-center">Repartition spend</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieSpendData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}
                  onClick={(_, idx) => handlePieClick(pieSpendData[idx].name)}>
                  {pieSpendData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}
                      stroke={activeType === entry.name ? '#1A2E4A' : 'transparent'} strokeWidth={activeType === entry.name ? 2 : 0} />
                  ))}
                </Pie>
                <Tooltip formatter={v => fEur(v)} contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(26,46,74,0.15)', borderRadius: 12, fontSize: 11, color: '#1A2E4A' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center mt-3">
            {pieSpendData.map((d, i) => (
              <button key={d.name} onClick={() => handlePieClick(d.name)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-inner text-[10px] font-medium transition-colors ${activeType === d.name ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy bg-bg-page'}`}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name}
              </button>
            ))}
          </div>
        </div>

        {/* Revenue Donut */}
        <div className="bg-white rounded-card p-6 border border-border shadow-card">
          <h3 className="text-[11px] font-semibold text-navy-muted uppercase tracking-wider mb-4 text-center">Repartition revenue</h3>
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pieRevenueData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={2}
                  onClick={(_, idx) => handlePieClick(pieRevenueData[idx].name)}>
                  {pieRevenueData.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}
                      stroke={activeType === entry.name ? '#1A2E4A' : 'transparent'} strokeWidth={activeType === entry.name ? 2 : 0} />
                  ))}
                </Pie>
                <Tooltip formatter={v => fEur(v)} contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(26,46,74,0.15)', borderRadius: 12, fontSize: 11, color: '#1A2E4A' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap gap-1.5 justify-center mt-3">
            {pieRevenueData.map((d, i) => (
              <button key={d.name} onClick={() => handlePieClick(d.name)}
                className={`flex items-center gap-1 px-2 py-0.5 rounded-inner text-[10px] font-medium transition-colors ${activeType === d.name ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy bg-bg-page'}`}>
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                {d.name}
              </button>
            ))}
          </div>
        </div>

        {/* ROAS Bar Chart */}
        <div className="bg-white rounded-card p-6 border border-border shadow-card">
          <h3 className="text-[11px] font-semibold text-navy-muted uppercase tracking-wider mb-4 text-center">ROAS par type</h3>
          <div className="h-[180px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeSummary} layout="vertical" margin={{ left: 10, right: 30, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(26,46,74,0.05)" />
                <XAxis type="number" hide />
                <YAxis dataKey="type" type="category" axisLine={false} tickLine={false} width={85} tick={{ fontSize: 10, fill: '#6B7280', fontWeight: 500 }} />
                <Tooltip cursor={{ fill: 'rgba(26,46,74,0.02)' }} contentStyle={{ background: '#FFFFFF', border: '1px solid rgba(26,46,74,0.15)', borderRadius: 12, fontSize: 11, color: '#1A2E4A' }}
                  formatter={(v) => [fROAS(v), 'ROAS']} />
                <Bar dataKey="roas" radius={[0, 4, 4, 0]} barSize={20}
                  onClick={(d) => handlePieClick(d.type)}>
                  {typeSummary.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} fillOpacity={activeType && activeType !== entry.type ? 0.3 : 1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Campaign table */}
      <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
        <div className="px-6 py-5 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h3 className="text-lg font-semibold text-navy">{sorted.length} Campagnes</h3>
            {selectedCampaigns.length > 0 && (
              <span className="text-[11px] text-navy-muted">{selectedCampaigns.length}/5 selectionnees pour comparaison ROAS</span>
            )}
          </div>
          <ExportButtons 
            onCsv={() => downloadCsv(TABLE_COLS, sorted, 'recap-campagnes.csv')}
            onSheets={async () => { await copyTsv(TABLE_COLS, sorted); setCopiedCamps(true); setTimeout(() => setCopiedCamps(false), 2000); }}
            copied={copiedCamps}
          />
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
                  <tr key={i} className={`border-b border-border hover:bg-navy/5 transition-colors group ${isSelected ? 'bg-mint-bg' : i % 2 === 1 ? 'bg-[#FAFBFD]' : ''}`}>
                    <td className="px-2 py-2.5">
                      <input type="checkbox" checked={isSelected} onChange={() => toggleCampaign(row.campaign_name)}
                        disabled={!isSelected && selectedCampaigns.length >= 5} className="w-3.5 h-3.5 rounded accent-navy" />
                    </td>
                    {TABLE_COLS.map(col => {
                      const val = row[col.key];
                      const formatted = col.format ? col.format(val) : val;
                      let cls = `px-3 py-2.5 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`;
                      
                      const deltaVal = row[`delta_${col.key}`];
                      
                      if (col.key === 'roas') cls += ' font-bold ' + (val >= 4 ? 'text-success' : val >= 2.5 ? 'text-warning' : 'text-danger');
                      else if (col.wide) cls += ' text-navy max-w-[300px] truncate font-medium';
                      else cls += ' text-navy';

                      return (
                        <td key={col.key} className={cls} title={col.wide ? val : undefined}>
                          <div className={col.align === 'right' ? 'flex flex-col items-end' : 'flex items-center'}>
                            {col.key === 'campaign_name' && <TypeBadge type={row.type} color={typeColors[row.type]} />}
                            <span className="leading-tight">{formatted}</span>
                            {col.hasDelta && deltaVal !== undefined && (
                              <span className={`text-[10px] font-medium ${deltaColor(deltaVal)} leading-tight`}>
                                {deltaVal > 0 ? '▲' : deltaVal < 0 ? '▼' : ''} {Math.abs(deltaVal).toFixed(1)}%
                              </span>
                            )}
                          </div>
                        </td>
                      );
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
