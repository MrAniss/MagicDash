import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis,
  Tooltip, ResponsiveContainer, ReferenceLine, LabelList,
} from 'recharts';
import { fetchApi } from '../utils/api';

function r2(v) { return Math.round(v * 100) / 100; }
function fEur(v) { if (v == null) return '—'; return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v); }
function fROASx(v) { if (v == null || isNaN(v)) return '—'; return v.toFixed(2) + '×'; }
function fPct(v) { if (v == null || isNaN(v)) return '—'; return v.toFixed(1) + '%'; }

function Skeleton() {
  return (
    <div className="grid grid-cols-3 gap-4">
      {[0, 1, 2].map(i => (
        <div key={i} className="skeleton h-64 rounded-inner" />
      ))}
    </div>
  );
}

// Donut chart with legend below
function DonutChart({ data, dataKey, title, activeKey, onSegmentClick, formatTooltip, formatLabel }) {
  const chartData = data.map(d => ({
    ...d,
    value: d[dataKey] || 0,
    dimmed: activeKey && activeKey !== d.scoring,
  }));

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold text-navy-muted uppercase tracking-[0.06em] mb-3">{title}</p>
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
            formatter={(value, name) => [formatTooltip ? formatTooltip(value, name, chartData) : value, name]}
            contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #E2E6EF' }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="w-full space-y-1.5 mt-1">
        {chartData.map(item => (
          <div
            key={item.scoring}
            className={`flex items-center gap-2 cursor-pointer transition-opacity ${item.dimmed ? 'opacity-30' : ''}`}
            onClick={() => onSegmentClick(item.scoring)}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: item.color }} />
            <span className="text-[11px] text-navy-muted">{item.label}</span>
            <span className="text-[11px] font-semibold text-navy">{formatLabel ? formatLabel(item) : item.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Horizontal bar chart for ROAS
function RoasBarChart({ data, activeKey, onSegmentClick }) {
  const sorted = [...data].sort((a, b) => b.roas - a.roas);
  const chartData = sorted.map(d => ({
    ...d,
    value: d.roas,
    fill: activeKey && activeKey !== d.scoring ? d.color + '40' : d.color,
  }));

  const CustomBar = (props) => {
    const { x, y, width, height, fill, index } = props;
    return (
      <rect
        x={x} y={y} width={width} height={height}
        fill={fill}
        rx={3}
        style={{ cursor: 'pointer' }}
        onClick={() => onSegmentClick(chartData[index]?.scoring)}
      />
    );
  };

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs font-semibold text-navy-muted uppercase tracking-[0.06em] mb-3">ROAS par scoring</p>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
          <XAxis type="number" domain={[0, 'auto']} tick={{ fontSize: 10 }} tickFormatter={v => v + '×'} />
          <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={56} />
          <Tooltip
            formatter={(v) => [fROASx(v), 'ROAS']}
            contentStyle={{ fontSize: 11, borderRadius: 6, border: '1px solid #E2E6EF' }}
          />
          <Bar dataKey="value" shape={<CustomBar />} isAnimationActive={false}>
            {chartData.map((entry) => (
              <Cell key={entry.scoring} fill={entry.fill} />
            ))}
            <LabelList dataKey="value" position="right" formatter={v => fROASx(v)} style={{ fontSize: 10, fill: '#334155' }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <div className="w-full space-y-1.5 mt-1">
        {sorted.map(item => (
          <div
            key={item.scoring}
            className={`flex items-center gap-2 cursor-pointer transition-opacity ${activeKey && activeKey !== item.scoring ? 'opacity-30' : ''}`}
            onClick={() => onSegmentClick(item.scoring)}
          >
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: item.color }} />
            <span className="text-[11px] text-navy-muted">{item.label}</span>
            <span className="text-[11px] font-semibold text-navy">{fROASx(item.roas)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Shared legend with product counts
function SharedLegend({ data, activeKey, onSegmentClick }) {
  return (
    <div className="flex flex-wrap gap-3 mb-5">
      {data.map(item => (
        <button
          key={item.scoring}
          onClick={() => onSegmentClick(item.scoring)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-all ${
            activeKey === item.scoring
              ? 'border-navy text-navy bg-navy/5'
              : 'border-border text-navy-muted bg-white hover:border-navy/40'
          }`}
        >
          <span className="w-2 h-2 rounded-full" style={{ background: item.color }} />
          {item.label}
          <span className="text-[10px] text-navy-muted">({item.product_count})</span>
        </button>
      ))}
      {activeKey && (
        <button
          onClick={() => onSegmentClick(null)}
          className="px-2.5 py-1 rounded-full border border-border text-[11px] text-navy-muted hover:border-navy/40"
        >
          Réinitialiser
        </button>
      )}
    </div>
  );
}

// Automatic insights
function ScoringInsights({ data }) {
  if (!data || data.length === 0) return null;

  const get = (scoring) => data.find(d => d.scoring === scoring);
  const top    = get('TOP');
  const flop   = get('FLOP');
  const zombie = get('ZOMBIE');

  const insights = [];

  if (top && top.revenue_pct > 0) {
    insights.push({
      icon: '🟢',
      text: `Les produits TOP génèrent ${fPct(top.revenue_pct)} du revenue pour ${fPct(top.spend_pct)} du spend — ROAS ${fROASx(top.roas)}.`,
    });
  }

  if (flop && flop.spend > 0) {
    insights.push({
      icon: '🔴',
      text: `Les produits FLOP consomment ${fPct(flop.spend_pct)} du spend avec un ROAS de ${fROASx(flop.roas)} (${flop.product_count} produits).`,
    });
  }

  if (zombie && zombie.spend > 0) {
    insights.push({
      icon: '⚠️',
      text: `Les produits ZOMBIE représentent ${fPct(zombie.spend_pct)} du spend.`,
    });
  }

  if (top && top.revenue_pct > 60) {
    insights.push({
      icon: '💡',
      text: `Les produits TOP concentrent ${fPct(top.revenue_pct)} du revenue.`,
    });
  }

  if (insights.length === 0) return null;

  return (
    <div className="mt-5 pt-4 border-t border-border">
      <p className="text-xs font-semibold text-navy uppercase tracking-[0.06em] mb-3">💡 Insights scoring</p>
      <div className="space-y-2.5">
        {insights.map((ins, i) => (
          <div key={i} className="flex gap-2.5 text-xs text-navy leading-relaxed">
            <span className="flex-shrink-0 mt-px">{ins.icon}</span>
            <span>{ins.text}</span>
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
    queryKey: ['shopping-scoring', from, to],
    queryFn: () => fetchApi('/api/shopping/scoring', { from, to }),
    staleTime: 30 * 60 * 1000,
    enabled,
  });

  function handleSegmentClick(scoring) {
    setActiveKey(prev => (prev === scoring || scoring === null) ? null : scoring);
  }

  const displayData = activeKey
    ? data?.map(d => ({ ...d, dimmed: d.scoring !== activeKey }))
    : data;

  return (
    <div className="bg-white rounded-card border border-border shadow-card overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between border-b border-border">
        <h3 className="text-base font-semibold text-navy">
          Analyse par scoring produit
          <span className="text-xs font-normal text-navy-muted ml-1">(custom_label_4)</span>
        </h3>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[#E3F2FD] text-[#1565C0] border border-[#1565C0]/20 uppercase tracking-wide">
          Cocooncenter FR
        </span>
      </div>

      <div className="px-6 pb-6 pt-5">
        {!enabled && (
          <p className="text-xs text-navy-muted text-center py-8">
            Pas de données — sélectionne <span className="font-semibold text-navy">Cocooncenter</span> + <span className="font-semibold text-navy">France</span> pour afficher l'analyse.
          </p>
        )}

        {enabled && isLoading && <Skeleton />}

        {enabled && isError && (
          <p className="text-xs text-danger text-center py-8">Erreur lors du chargement des données de scoring.</p>
        )}

        {enabled && !isLoading && !isError && (!data || data.length === 0) && (
          <p className="text-xs text-navy-muted text-center py-8">Aucune donnée de scoring disponible pour cette période.</p>
        )}

        {enabled && !isLoading && !isError && data && data.length > 0 && (
          <>
            <SharedLegend data={data} activeKey={activeKey} onSegmentClick={handleSegmentClick} />

            <div className="grid grid-cols-3 gap-6">
              {/* Donut — Spend */}
              <DonutChart
                data={displayData}
                dataKey="spend_pct"
                title="Spend par scoring"
                activeKey={activeKey}
                onSegmentClick={handleSegmentClick}
                formatTooltip={(value, name, all) => {
                  const item = all.find(d => d.label === name);
                  return [`${fPct(value)} — ${fEur(item?.spend)}`, name];
                }}
                formatLabel={(item) => fPct(item.value)}
              />

              {/* Donut — Revenue */}
              <DonutChart
                data={displayData}
                dataKey="revenue_pct"
                title="Revenue par scoring"
                activeKey={activeKey}
                onSegmentClick={handleSegmentClick}
                formatTooltip={(value, name, all) => {
                  const item = all.find(d => d.label === name);
                  return [`${fPct(value)} — ${fEur(item?.revenue)}`, name];
                }}
                formatLabel={(item) => fPct(item.value)}
              />

              {/* Bar — ROAS */}
              <RoasBarChart
                data={displayData}
                activeKey={activeKey}
                onSegmentClick={handleSegmentClick}
              />
            </div>

            <ScoringInsights data={data} />
          </>
        )}
      </div>
    </div>
  );
}
