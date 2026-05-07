import { useWeeklySummary } from '../hooks/useAdsData';
import { fEur, fNum } from '../utils/formatters';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  LabelList,
} from 'recharts';

export default function WeeklyPerformanceSummary({ brand, market, dataSource = 'ads' }) {
  const { data, isLoading, isError } = useWeeklySummary({ brand, market, dataSource });

  if (isLoading)
    return (
      <div className="bg-card rounded-card border border-border p-8 flex flex-col items-center justify-center animate-pulse">
        <div className="w-12 h-12 rounded-full border-4 border-navy/10 border-t-navy animate-spin mb-4" />
        <span className="text-sm text-navy-muted font-medium">
          Analyse des performances hebdomadaires...
        </span>
      </div>
    );

  if (isError || !data) return null;

  const { global, insights, periods, granularity } = data;
  const isCampaign = granularity === 'campaign';

  // Order requested: Current (W), Previous (W-1), Last Year (N-1)
  const chartData = [
    {
      name: periods.current.label,
      roas: global.current.roas,
      revenue: global.current.revenue,
      color: '#1A2E4A',
    },
    {
      name: periods.previous.label,
      roas: global.previous.roas,
      revenue: global.previous.revenue,
      color: '#64748B',
    },
    {
      name: periods.lastYear.label,
      roas: global.lastYear.roas,
      revenue: global.lastYear.revenue,
      color: '#94A3B8',
    },
  ];

  return (
    <div className="space-y-8">
      {/* Header Info */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-navy italic">
            REPORT AUTO : {periods.current.label}
          </h2>
          <p className="text-xs text-navy-muted">
            Semaine étudiée : {new Date(periods.current.from).toLocaleDateString()} au{' '}
            {new Date(periods.current.to).toLocaleDateString()}
          </p>
        </div>
        <div className="flex gap-4">
          <div className="text-right">
            <span className="block text-[10px] uppercase tracking-wider text-navy-muted font-bold">
              Trend vs {periods.previous.label}
            </span>
            <DeltaBadge value={global.deltasW1.roas} label="ROAS" />
          </div>
        </div>
      </div>

      {/* Main Stats and Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1 grid grid-cols-1 gap-4">
          <MetricCard
            label="Chiffre d'Affaires"
            value={fEur(global.current.revenue)}
            deltaW1={global.deltasW1.revenue}
            deltaLY={global.deltasLY.revenue}
            prevLabel={periods.previous.label}
            lyLabel={periods.lastYear.label}
          />
          <MetricCard
            label="ROAS Global"
            value={global.current.roas.toFixed(2) + 'x'}
            deltaW1={global.deltasW1.roas}
            deltaLY={global.deltasLY.roas}
            isPrimary
            prevLabel={periods.previous.label}
            lyLabel={periods.lastYear.label}
          />
          <MetricCard
            label="Conversions"
            value={fNum(global.current.conversions)}
            deltaW1={global.deltasW1.conversions}
            deltaLY={global.deltasLY.conversions}
            prevLabel={periods.previous.label}
            lyLabel={periods.lastYear.label}
          />
        </div>

        {/* Visual Chart Comparison */}
        <div className="xl:col-span-2 bg-white border border-border rounded-card p-5">
          <h3 className="text-xs font-bold text-navy uppercase tracking-widest mb-6 flex items-center gap-2">
            <span className="w-1.5 h-4 bg-navy rounded-full" />
            Bench Historique ROAS
          </h3>
          <div className="h-[240px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 5, right: 60, left: 40, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fontStyle: 'italic', fontWeight: 800, fill: '#1A2E4A' }}
                />
                <Tooltip
                  cursor={{ fill: '#F1F5F9' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-navy text-white p-2.5 rounded shadow-xl border border-white/10 text-xs">
                          <p className="font-bold border-b border-white/10 pb-1.5 mb-1.5">
                            {payload[0].payload.name}
                          </p>
                          <p>
                            ROAS : <span className="font-bold">{payload[0].value.toFixed(2)}x</span>
                          </p>
                          <p>
                            CA :{' '}
                            <span className="font-bold">{fEur(payload[0].payload.revenue)}</span>
                          </p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar dataKey="roas" radius={[0, 4, 4, 0]} barSize={32}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                  <LabelList
                    dataKey="roas"
                    position="right"
                    formatter={(v) => `${v.toFixed(2)}x`}
                    style={{ fontSize: 13, fontWeight: 900, fill: '#1A2E4A' }}
                    offset={10}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#1A2E4A]" />
              <span className="text-[10px] font-bold text-navy-muted uppercase">
                {periods.current.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#64748B]" />
              <span className="text-[10px] font-bold text-navy-muted uppercase">
                {periods.previous.label}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded bg-[#94A3B8]" />
              <span className="text-[10px] font-bold text-navy-muted uppercase">
                {periods.lastYear.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tops & Flops */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tops */}
        <div className="bg-success/5 border border-success/10 rounded-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-full bg-success/20 flex items-center justify-center shadow-sm">
              <span className="text-success text-lg">↑</span>
            </div>
            <div>
              <h3 className="font-bold text-navy text-sm">Top Performances</h3>
              <p className="text-[10px] text-success-dark font-medium uppercase tracking-tight">
                Progression ROAS ({isCampaign ? 'Campagnes' : 'Marchés'})
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {insights.tops.length > 0 ? (
              insights.tops.map((top, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/80 p-3 rounded-xl border border-success/20 shadow-sm transition-transform hover:scale-[1.01]"
                >
                  <div className="flex flex-col max-w-[70%]">
                    <span className="font-black text-navy text-sm truncate" title={top.label}>
                      {top.label}
                    </span>
                    <span className="text-[10px] text-navy-muted uppercase font-bold bg-navy/5 px-1.5 py-0.5 rounded w-fit mt-1">
                      ROAS: {top.roas.toFixed(2)}x
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-success font-black text-sm">
                        +{top.delta.toFixed(1)}%
                      </span>
                    </div>
                    <span className="block text-[9px] text-navy-muted font-bold uppercase tracking-tighter mt-0.5">
                      vs {periods.previous.label}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-navy-muted italic p-4 text-center border border-dashed border-border rounded-xl">
                Aucune variation significative positive cette semaine (sur base stable).
              </p>
            )}
          </div>
        </div>

        {/* Flops */}
        <div className="bg-danger/5 border border-danger/10 rounded-card p-5">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-full bg-danger/20 flex items-center justify-center shadow-sm">
              <span className="text-danger text-lg">↓</span>
            </div>
            <div>
              <h3 className="font-bold text-navy text-sm">Points de Vigilance</h3>
              <p className="text-[10px] text-danger-dark font-medium uppercase tracking-tight">
                Baisse ROAS ({isCampaign ? 'Campagnes' : 'Marchés'})
              </p>
            </div>
          </div>
          <div className="space-y-3">
            {insights.flops.length > 0 ? (
              insights.flops.map((flop, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between bg-white/80 p-3 rounded-xl border border-danger/20 shadow-sm transition-transform hover:scale-[1.01]"
                >
                  <div className="flex flex-col max-w-[70%]">
                    <span className="font-black text-navy text-sm truncate" title={flop.label}>
                      {flop.label}
                    </span>
                    <span className="text-[10px] text-navy-muted uppercase font-bold bg-navy/5 px-1.5 py-0.5 rounded w-fit mt-1">
                      ROAS: {flop.roas.toFixed(2)}x
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-1 justify-end">
                      <span className="text-danger font-black text-sm">
                        {flop.delta.toFixed(1)}%
                      </span>
                    </div>
                    <span className="block text-[9px] text-navy-muted font-bold uppercase tracking-tighter mt-0.5">
                      vs {periods.previous.label}
                    </span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-navy-muted italic p-4 text-center border border-dashed border-border rounded-xl">
                Aucune baisse majeure détectée sur les marchés établis.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Anomalies & Actions */}
      {insights.anomalies.length > 0 && (
        <div className="bg-warning/10 border border-warning/30 rounded-card p-5">
          <div className="flex items-center gap-2 mb-4">
            <span className="text-warning text-xl font-bold animate-pulse">⚠️</span>
            <div>
              <h3 className="font-bold text-navy text-sm">
                Anomalies & Recommandations Techniques
              </h3>
              <p className="text-[10px] text-warning-dark font-bold uppercase">
                Alertes par {isCampaign ? 'Campagne' : 'Marché'}
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {insights.anomalies.map((anom, i) => (
              <div
                key={i}
                className="flex gap-3 bg-white/60 p-4 rounded-xl border border-warning/30 shadow-sm"
              >
                <div
                  className={`w-1.5 self-stretch rounded-full ${anom.severity === 'high' ? 'bg-danger' : 'bg-warning'}`}
                />
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span
                      className="font-black text-navy text-xs uppercase truncate max-w-[200px]"
                      title={anom.market}
                    >
                      {anom.market}
                    </span>
                    <span
                      className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${anom.severity === 'high' ? 'bg-danger/20 text-danger' : 'bg-warning/20 text-warning-dark'}`}
                    >
                      {anom.severity === 'high' ? 'Alerte Critique' : 'Avertissement'}
                    </span>
                  </div>
                  <p className="text-[11px] text-navy/90 font-medium leading-relaxed">
                    {anom.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!insights.anomalies.length && (
        <div className="bg-success/5 border border-success/20 rounded-card p-4 text-center flex items-center justify-center gap-3">
          <span className="text-success">✓</span>
          <p className="text-xs text-success-dark font-bold italic">
            Moteur de détection : Aucune anomalie de tracking ou de tunnel détectée cette semaine.
          </p>
        </div>
      )}
    </div>
  );
}

function MetricCard({ label, value, deltaW1, deltaLY, isPrimary = false, prevLabel, lyLabel }) {
  return (
    <div
      className={`p-5 rounded-card border transition-all hover:shadow-md ${isPrimary ? 'bg-navy border-navy text-white shadow-lg' : 'bg-white border-border text-navy'}`}
    >
      <span
        className={`text-[10px] font-black uppercase tracking-widest block mb-1 ${isPrimary ? 'text-white/60' : 'text-navy-muted'}`}
      >
        {label}
      </span>
      <div className="text-2xl font-black mb-4 tracking-tighter">{value}</div>
      <div className="space-y-2">
        <div className="flex items-center justify-between border-t border-current/10 pt-2">
          <span
            className={`text-[9px] font-bold uppercase ${isPrimary ? 'text-white/50' : 'text-navy-muted'}`}
          >
            {prevLabel}
          </span>
          <MiniDelta value={deltaW1} isLight={isPrimary} />
        </div>
        <div className="flex items-center justify-between">
          <span
            className={`text-[9px] font-bold uppercase ${isPrimary ? 'text-white/50' : 'text-navy-muted'}`}
          >
            {lyLabel}
          </span>
          <MiniDelta value={deltaLY} isLight={isPrimary} />
        </div>
      </div>
    </div>
  );
}

function MiniDelta({ value, isLight }) {
  if (value === 0) return <span className={`text-[10px] font-bold opacity-50`}>= 0%</span>;
  const isPositive = value > 0;
  const colorClass = isLight
    ? isPositive
      ? 'text-success-light'
      : 'text-danger-light'
    : isPositive
      ? 'text-success'
      : 'text-danger';

  return (
    <span className={`text-[10px] font-black ${colorClass}`}>
      {isPositive ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
    </span>
  );
}

function DeltaBadge({ value, label }) {
  const isPositive = value > 0;
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] font-black shadow-sm ${isPositive ? 'bg-success text-white' : 'bg-danger text-white'}`}
    >
      <span>
        {isPositive ? '▲' : '▼'} {Math.abs(value).toFixed(1)}%
      </span>
      <span className="text-[10px] opacity-80 uppercase tracking-tighter">{label}</span>
    </div>
  );
}
