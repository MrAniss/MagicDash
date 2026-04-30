import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { fetchApi } from '../utils/api';

function fEur(v) {
  if (v == null) return '—';
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 0,
  }).format(v);
}
function fROASx(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(2) + '×';
}
function fPct(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(1) + '%';
}

function Skeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div key={i} className="skeleton h-64 rounded-inner" />
      ))}
    </div>
  );
}

// Donut chart with legend below
function DonutChart({
  data,
  dataKey,
  title,
  activeKey,
  onSegmentClick,
  formatTooltip,
  formatLabel,
}) {
  const chartData = data.map((d) => ({
    ...d,
    value: d[dataKey] || 0,
    dimmed: activeKey && activeKey !== d.scoring,
  }));

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold text-navy-muted uppercase tracking-[0.06em] mb-3">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={chartData}
            dataKey="value"
            nameKey="label"
            innerRadius={52}
            outerRadius={82}
            paddingAngle={2}
          >
            {chartData.map((entry) => (
              <Cell
                key={entry.scoring}
                fill={entry.color}
                opacity={entry.dimmed ? 0.25 : 1}
                style={{ cursor: 'pointer' }}
                onClick={() => onSegmentClick(entry.scoring)}
              />
            ))}
          </Pie>
          <Tooltip
            formatter={(value, name) => [
              formatTooltip ? formatTooltip(value, name, chartData) : value,
              name,
            ]}
            contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #E2E6EF' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="w-full space-y-1.5 mt-1">
        {chartData.map((item) => (
          <div
            key={item.scoring}
            className={`flex items-center gap-2 cursor-pointer transition-opacity ${item.dimmed ? 'opacity-30' : ''}`}
            onClick={() => onSegmentClick(item.scoring)}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ background: item.color }}
            />
            <span className="text-[11px] text-navy-muted">{item.label}</span>
            <span className="text-[11px] font-semibold text-navy">
              {formatLabel ? formatLabel(item) : item.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Horizontal bar chart component
function GenericBarChart({ data, dataKey, title, label, activeKey, onSegmentClick, formatValue }) {
  const sorted = [...data].sort((a, b) => b[dataKey] - a[dataKey]);
  const chartData = sorted.map((d) => ({
    ...d,
    value: d[dataKey],
    fill: activeKey && activeKey !== d.scoring ? d.color + '40' : d.color,
  }));

  const CustomBar = (props) => {
    const { x, y, width, height, fill, index } = props;
    return (
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fill}
        rx={3}
        style={{ cursor: 'pointer' }}
        onClick={() => onSegmentClick(chartData[index]?.scoring)}
      />
    );
  };

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold text-navy-muted uppercase tracking-[0.06em] mb-3">
        {title}
      </p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart
          data={chartData}
          layout="vertical"
          margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
        >
          <XAxis
            type="number"
            domain={[0, 'auto']}
            tick={{ fontSize: 10 }}
            tickFormatter={(v) => v + '×'}
          />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={56} />
          <Tooltip
            formatter={(v) => [formatValue(v), label]}
            contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #E2E6EF' }}
          />
          <Bar dataKey="value" shape={<CustomBar />} isAnimationActive={false}>
            {chartData.map((entry) => (
              <Cell key={entry.scoring} fill={entry.fill} />
            ))}
            <LabelList
              dataKey="value"
              position="right"
              formatter={(v) => formatValue(v)}
              style={{ fontSize: 10, fill: '#334155' }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="w-full space-y-1.5 mt-1">
        {sorted.map((item) => (
          <div
            key={item.scoring}
            className={`flex items-center gap-2 cursor-pointer transition-opacity ${activeKey && activeKey !== item.scoring ? 'opacity-30' : ''}`}
            onClick={() => onSegmentClick(item.scoring)}
          >
            <span
              className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
              style={{ background: item.color }}
            />
            <span className="text-[11px] text-navy-muted">{item.label}</span>
            <span className="text-[11px] font-semibold text-navy">
              {formatValue(item[dataKey])}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ShoppingScoringCharts({ brand, market, from, to }) {
  const [activeKey, setActiveKey] = useState(null);

  const enabled = brand === 'COCOONCENTER' && market === 'FR';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['shopping-scoring-v3', from, to],
    queryFn: () => fetchApi('/api/shopping/scoring', { from, to }),
    staleTime: 30 * 60 * 1000,
    enabled,
  });

  function handleSegmentClick(scoring) {
    setActiveKey((prev) => (prev === scoring || scoring === null ? null : scoring));
  }

  const displayData = activeKey
    ? data?.map((d) => ({ ...d, dimmed: d.scoring !== activeKey }))
    : data;

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden text-navy">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-border">
        <div className="flex flex-col">
          <h3 className="text-base font-semibold">Analyse par scoring</h3>
          <p className="text-[10px] text-navy-muted uppercase tracking-wider font-bold">
            Structure PMax : Top/Middle • Flop • Zombie
          </p>
        </div>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E3F2FD] text-[#1565C0] border border-[#1565C0]/20 uppercase tracking-wide">
          Cocooncenter FR
        </span>
      </div>

      <div className="px-6 pb-6 pt-5">
        {!enabled && (
          <p className="text-xs text-navy-muted text-center py-8">
            Pas de données — sélectionne <span className="font-semibold">Cocooncenter</span> +{' '}
            <span className="font-semibold">France</span> pour afficher l&apos;analyse.
          </p>
        )}

        {enabled && isLoading && <Skeleton />}

        {enabled && isError && (
          <p className="text-xs text-danger text-center py-8">
            Erreur lors du chargement des données de scoring.
          </p>
        )}

        {enabled && !isLoading && !isError && (!data || data.length === 0) && (
          <p className="text-xs text-navy-muted text-center py-8">
            Aucune campagne PMax correspondante trouvée.
          </p>
        )}

        {enabled && !isLoading && !isError && data && data.length > 0 && (
          <>
            <div className="flex flex-wrap gap-3 mb-8">
              {data.map((item) => (
                <button
                  key={item.scoring}
                  onClick={() => handleSegmentClick(item.scoring)}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold transition-all ${
                    activeKey === item.scoring
                      ? 'border-navy text-white bg-navy shadow-md'
                      : 'border-border text-navy-muted bg-white hover:border-navy/40'
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ background: activeKey === item.scoring ? 'white' : item.color }}
                  />
                  {item.label}
                </button>
              ))}
              {activeKey && (
                <button
                  onClick={() => handleSegmentClick(null)}
                  className="px-3 py-1 rounded-full border border-dashed border-border text-[11px] text-navy-muted hover:text-navy hover:border-navy"
                >
                  Réinitialiser
                </button>
              )}
            </div>

            {/* First Row : Spend, Revenue, POAS */}
            <div className="grid grid-cols-3 gap-8 mb-10">
              <DonutChart
                data={displayData}
                dataKey="spend_pct"
                title="Spend par scoring"
                activeKey={activeKey}
                onSegmentClick={handleSegmentClick}
                formatTooltip={(value, name, all) => {
                  const item = all.find((d) => d.label === name);
                  return [`${fPct(value)} — ${fEur(item?.spend)}`, name];
                }}
                formatLabel={(item) => fPct(item.value)}
              />

              <DonutChart
                data={displayData}
                dataKey="revenue_pct"
                title="Revenue par scoring"
                activeKey={activeKey}
                onSegmentClick={handleSegmentClick}
                formatTooltip={(value, name, all) => {
                  const item = all.find((d) => d.label === name);
                  return [`${fPct(value)} — ${fEur(item?.revenue)}`, name];
                }}
                formatLabel={(item) => fPct(item.value)}
              />

              <GenericBarChart
                data={displayData}
                dataKey="poas"
                title="POAS par scoring"
                label="POAS"
                activeKey={activeKey}
                onSegmentClick={handleSegmentClick}
                formatValue={fROASx}
              />
            </div>

            <div className="mt-8 pt-4 border-t border-border grid grid-cols-2 gap-8">
              {/* Lexique / Légende */}
              <div>
                <p className="text-xs font-semibold text-navy uppercase tracking-[0.06em] mb-3">
                  📖 Lexique du scoring
                </p>
                <div className="bg-bg-page/50 rounded-card border border-border/50 p-3">
                  <table className="w-full text-[11px]">
                    <tbody>
                      <tr className="border-b border-border/30">
                        <td className="py-1 text-navy-muted">Trafic mini.</td>
                        <td className="py-1 text-right font-semibold text-navy">10 clics</td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1 text-navy-muted">POAS Breakeven</td>
                        <td className="py-1 text-right font-semibold text-navy">1.00×</td>
                      </tr>
                      <tr className="border-b border-border/30">
                        <td className="py-1 text-navy-muted">POAS Top</td>
                        <td className="py-1 text-right font-semibold text-navy">2.50×</td>
                      </tr>
                      <tr>
                        <td className="py-1 text-navy-muted">Dernier refresh</td>
                        <td className="py-1 text-right font-semibold text-navy">
                          {to ? new Date(to).toLocaleDateString('fr-FR') : '—'}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="mt-3 space-y-1">
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#8896B0]" />
                      <span className="text-navy-muted">
                        <strong className="text-navy">Zombie</strong> : Moins de 10 clics
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#E8524A]" />
                      <span className="text-navy-muted">
                        <strong className="text-navy">Flop</strong> : POAS &lt; 1.00
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#00B87A]" />
                      <span className="text-navy-muted">
                        <strong className="text-navy">Middle / Top</strong> : POAS &gt; 1.00
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Analyse structurelle */}
              <div>
                <p className="text-xs font-semibold text-navy uppercase tracking-[0.06em] mb-3">
                  💡 Analyse structurelle
                </p>
                <div className="space-y-2.5">
                  {(() => {
                    const get = (s) => data.find((d) => d.scoring === s);
                    const top = get('TOP_MIDDLE');
                    const flop = get('FLOP');
                    const zombie = get('ZOMBIE');
                    const insights = [];

                    if (top)
                      insights.push({
                        icon: '🟢',
                        text: `Le segment Top/Middle concentre ${fPct(top.revenue_pct)} du CA pour un POAS réel de ${fROASx(top.poas)}.`,
                      });
                    if (flop)
                      insights.push({
                        icon: '🔴',
                        text: `Le segment Flop consomme ${fPct(flop.spend_pct)} du budget avec un POAS de ${fROASx(flop.poas)}.`,
                      });
                    if (zombie)
                      insights.push({
                        icon: '⚠️',
                        text: `Le segment Zombie représente ${fPct(zombie.spend_pct)} du spend.`,
                      });

                    return insights.map((ins, i) => (
                      <div key={i} className="flex gap-2.5 text-xs text-navy leading-relaxed">
                        <span className="flex-shrink-0 mt-px">{ins.icon}</span>
                        <span>{ins.text}</span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
