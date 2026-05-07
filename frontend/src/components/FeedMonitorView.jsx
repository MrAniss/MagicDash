import { useState, useMemo, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, ReferenceLine, Legend,
} from 'recharts';
import { fNum } from '../utils/formatters';
import { fetchApi, API_URL, authFetch } from '../utils/api';
import { downloadCsv } from '../utils/exportTable';
import AccordionSection from './AccordionSection';

const BRAND_KEY_MAP = {
  COCOONCENTER:            'COCOONCENTER',
  PASCAL_COSTE:            'PASCAL_COSTE',
  PARAPHARMACIE_LAFAYETTE: 'PARAPHARMACIE_LAFAYETTE',
  LASANTE:                 'LASANTE',
  ALL:                     'COCOONCENTER',
};

const BRAND_LABEL = {
  COCOONCENTER:            'Cocooncenter',
  PASCAL_COSTE:            'Pascal Coste',
  PARAPHARMACIE_LAFAYETTE: 'Para. Lafayette',
  LASANTE:                 'LaSante.net',
};

function formatRelativeTime(isoDate) {
  if (!isoDate) return '—';
  const then = new Date(isoDate);
  const diffMs = Date.now() - then.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1)   return "à l'instant";
  if (min < 60)  return `il y a ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)    return `il y a ${h}h`;
  const d = Math.floor(h / 24);
  return `il y a ${d}j`;
}

function formatDateFR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
    + ' à ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Virtualization helper — wraps useVirtualizer with the padding-row math
// every diff table needs. Returns refs + slices ready to plug into the markup.
function useRowVirtualizer(rows, estimateSize = 32) {
  const parentRef = useRef(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const totalSize = virtualizer.getTotalSize();
  const paddingTop    = items.length ? items[0].start : 0;
  const paddingBottom = items.length ? totalSize - items[items.length - 1].end : 0;
  return { parentRef, items, paddingTop, paddingBottom };
}

// ─── Section 1 — Last snapshot card ─────────────────────────
function LastSnapshotCard({ summary, isLoading, brand, market, onTriggered }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState(null);
  const [bulkStarted, setBulkStarted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const url = new URL('/api/feed-monitor/run', API_URL || window.location.origin);
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brand, market }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: () => {
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['feed-monitor'] });
      if (onTriggered) onTriggered();
    },
    onError: (e) => setError(e?.message || 'Échec du snapshot'),
  });

  const bulkMutation = useMutation({
    mutationFn: async () => {
      const url = new URL('/api/feed-monitor/run-all', API_URL || window.location.origin);
      const res = await authFetch(url, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => {
      setError(null);
      setBulkStarted(true);
      console.log(`Bulk snapshot started for ${data.targets} targets`);
    },
    onError: (e) => setError(e?.message || 'Échec du bulk snapshot'),
  });

  const last = summary?.last_snapshot;
  const isRunning = mutation.isPending;

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="flex items-start justify-between mb-4 gap-4">
        <div>
          <div className="text-sm text-navy-muted">
            {last ? `Dernier snapshot — ${formatRelativeTime(last.date)}` : 'Aucun snapshot disponible'}
          </div>
          <div className="text-base font-semibold text-navy mt-0.5">
            {last
              ? `${formatDateFR(last.date)} (${last.trigger}) — ${fNum(last.total_products)} produits`
              : 'Lancez un premier snapshot pour initialiser le suivi.'}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => mutation.mutate()}
            disabled={isRunning}
            className={`px-3 py-2 text-xs font-semibold rounded-inner border transition-colors ${
              isRunning
                ? 'border-border bg-bg-page text-navy-muted cursor-wait'
                : 'border-navy bg-navy text-white hover:bg-navy-light'
            }`}
          >
            {isRunning ? 'Snapshot en cours…' : `🔄 Snapshot ${market}`}
          </button>
          <button
            onClick={() => {
              if (window.confirm('Lancer un snapshot pour toutes les marques × marchés (16 cibles) ? Cela peut prendre 30-60 minutes en tâche de fond.')) {
                bulkMutation.mutate();
              }
            }}
            disabled={bulkMutation.isPending || bulkStarted}
            className={`px-3 py-2 text-xs font-semibold rounded-inner border transition-colors ${
              bulkStarted
                ? 'border-success bg-success-bg text-success'
                : bulkMutation.isPending
                  ? 'border-border bg-bg-page text-navy-muted cursor-wait'
                  : 'border-warning bg-white text-warning hover:bg-warning-bg'
            }`}
            title="Lance un snapshot pour toutes les marques et tous les marchés (≈30-60 min en tâche de fond)"
          >
            {bulkStarted
              ? '✅ Bulk lancé'
              : bulkMutation.isPending
                ? 'Démarrage…'
                : '⚡ Tout charger'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 bg-danger-bg border border-danger/20 rounded-inner px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      {isRunning && (
        <div className="mb-3 bg-warning-bg border border-warning/20 rounded-inner px-3 py-2 text-xs text-warning">
          Récupération du flux en cours — peut prendre 2 à 5 minutes pour Cocooncenter.
        </div>
      )}

      {bulkStarted && (
        <div className="mb-3 bg-success-bg border border-success/20 rounded-inner px-3 py-2 text-xs text-success">
          ⚡ Bulk snapshot démarré en arrière-plan pour toutes les marques × marchés. Suis l&apos;avancée dans les logs backend. Les premiers résultats apparaîtront ici dès que chaque cible sera terminée (rafraîchis la page).
        </div>
      )}

      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-navy-muted mb-1.5 font-bold">Changements</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SubCard
              icon="➕"
              label="Ajoutés"
              value={last?.added}
              accent="text-success"
              loading={isLoading}
            />
            <SubCard
              icon="➖"
              label="Supprimés"
              value={last?.removed}
              accent="text-danger"
              loading={isLoading}
            />
            <SubCard
              icon="🔄"
              label="Modifiés"
              value={last?.modified}
              accent="text-navy"
              loading={isLoading}
            />
            <SubCard
              icon="🚨"
              label="Critiques"
              value={last?.critical_changes}
              accent={(last?.critical_changes || 0) > 50 ? 'text-danger animate-pulse' : 'text-warning'}
              alert={(last?.critical_changes || 0) > 50}
              loading={isLoading}
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-wider text-navy-muted mb-1.5 font-bold">Stock</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SubCard
              icon="📦"
              label="Total catalogue"
              value={summary?.stock?.total ?? last?.total_products}
              accent="text-navy"
              loading={isLoading}
            />
            <SubCard
              icon="✅"
              label="En stock"
              value={summary?.stock?.in_stock}
              accent="text-success"
              loading={isLoading}
            />
            <SubCard
              icon="🚫"
              label="Out of stock"
              value={summary?.stock?.out_of_stock}
              accent="text-danger"
              loading={isLoading}
            />
            <SubCard
              icon="📉"
              label="Passés OOS"
              value={summary?.stock?.transitions_to_out}
              sub={(summary?.stock?.transitions_to_in || 0) > 0
                ? `↩️ ${fNum(summary.stock.transitions_to_in)} repassés en stock`
                : null}
              accent={(summary?.stock?.transitions_to_out || 0) > 50 ? 'text-danger animate-pulse' : 'text-warning'}
              alert={(summary?.stock?.transitions_to_out || 0) > 50}
              loading={isLoading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function SubCard({ icon, label, value, sub, accent, alert, loading }) {
  return (
    <div className={`rounded-inner border ${alert ? 'border-danger bg-danger-bg' : 'border-border bg-bg-page'} px-3 py-2.5`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-navy-muted">
        <span>{icon}</span>{label}
      </div>
      <div className={`text-xl font-bold mt-0.5 ${accent}`}>
        {loading ? '…' : value != null ? fNum(value) : '—'}
      </div>
      {sub && <div className="text-[10px] text-navy-muted mt-0.5 truncate" title={sub}>{sub}</div>}
    </div>
  );
}

// ─── Section 2 — 7d trend bar chart ─────────────────────────
function TrendChart({ trend }) {
  if (!trend || !trend.length) {
    return (
      <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4 text-center text-sm text-navy-muted">
        {"Pas encore d'historique — lancez 2 snapshots pour voir l'évolution."}
      </div>
    );
  }
  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="text-sm font-semibold text-navy mb-3">Évolution sur 7 jours</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="added"    name="Ajoutés"            stackId="a" fill="#22c55e" />
          <Bar dataKey="removed"  name="Supprimés"          stackId="a" fill="#ef4444" />
          <Bar dataKey="modified" name="Modif. non-crit."   stackId="a" fill="#f59e0b" />
          <Bar dataKey="critical" name="Modif. critiques"   stackId="a" fill="#b91c1c" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── Section 3 — Critical changes table ─────────────────────
function CriticalChangesTable({ brand, market }) {
  const [attribute, setAttribute] = useState('all');
  const [search, setSearch] = useState('');

  const { data: attrsData } = useQuery({
    queryKey: ['feed-monitor', 'attributes'],
    queryFn: () => fetchApi('/api/feed-monitor/attributes'),
    staleTime: 60 * 60 * 1000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['feed-monitor', 'diffs-critical', brand, market, attribute, search],
    queryFn: () =>
      fetchApi('/api/feed-monitor/diffs', {
        brand,
        market,
        type: 'modified',
        critical_only: 'true',
        attribute: attribute !== 'all' ? attribute : undefined,
        search: search || undefined,
        limit: 50000,
      }),
  });

  const criticalAttrs = (attrsData?.attributes || []).filter(a => a.critical);
  const rows = data?.rows || [];

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-sm font-semibold text-navy">
          🚨 Changements critiques
          {data?.total != null && <span className="ml-2 text-[11px] font-normal text-navy-muted">({fNum(data.total)})</span>}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={attribute}
            onChange={e => setAttribute(e.target.value)}
            className="text-xs border border-border rounded-inner px-2 py-1 bg-white"
          >
            <option value="all">Tous attributs critiques</option>
            {criticalAttrs.map(a => (
              <option key={a.key} value={a.key}>{a.label}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Chercher ID/titre…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="text-xs border border-border rounded-inner px-2 py-1 bg-white w-48"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-xs text-navy-muted">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-xs text-navy-muted">
          Aucun changement critique pour ces filtres.
        </div>
      ) : (
        <CriticalRowsVirtualTable rows={rows} />
      )}
    </div>
  );
}

function CriticalRowsVirtualTable({ rows }) {
  const { parentRef, items, paddingTop, paddingBottom } = useRowVirtualizer(rows);
  return (
    <div ref={parentRef} className="overflow-auto border border-border rounded-inner" style={{ maxHeight: 480 }}>
      <table className="w-full text-xs">
        <thead className="bg-bg-page text-navy-muted sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium">ID</th>
            <th className="text-left px-2 py-1.5 font-medium">Produit</th>
            <th className="text-left px-2 py-1.5 font-medium">Attribut</th>
            <th className="text-left px-2 py-1.5 font-medium">Avant</th>
            <th className="text-left px-2 py-1.5 font-medium">Après</th>
            <th className="text-left px-2 py-1.5 font-medium">Détecté</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && <tr><td colSpan={6} style={{ height: paddingTop }} /></tr>}
          {items.map(v => {
            const r = rows[v.index];
            return (
              <tr key={r.id ?? v.index} className="border-t border-border hover:bg-bg-page">
                <td className="px-2 py-1.5 font-mono text-[10px] text-navy-muted">{r.product_id}</td>
                <td className="px-2 py-1.5 max-w-[280px] truncate" title={r.product_title}>
                  {r.product_title || '—'}
                </td>
                <td className="px-2 py-1.5">
                  <span className="text-[10px] font-bold text-danger uppercase">{r.attribute_label}</span>
                </td>
                <td className="px-2 py-1.5 text-navy-muted line-through max-w-[200px] truncate" title={r.old_value}>
                  {r.old_value || '∅'}
                </td>
                <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.new_value}>
                  {r.new_value || '∅'}
                </td>
                <td className="px-2 py-1.5 text-navy-muted">{formatRelativeTime(r.detected_at)}</td>
              </tr>
            );
          })}
          {paddingBottom > 0 && <tr><td colSpan={6} style={{ height: paddingBottom }} /></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 4 — Attribute deep dive ────────────────────────
function AttributeDeepDive({ brand, market }) {
  const { data: attrsData } = useQuery({
    queryKey: ['feed-monitor', 'attributes'],
    queryFn: () => fetchApi('/api/feed-monitor/attributes'),
    staleTime: 60 * 60 * 1000,
  });
  const [attribute, setAttribute] = useState('brand');

  const { data, isLoading } = useQuery({
    queryKey: ['feed-monitor', 'attribute-changes', brand, market, attribute],
    queryFn: () => fetchApi('/api/feed-monitor/attribute-changes', { brand, market, attribute, days: 90 }),
    enabled: !!attribute,
  });

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-sm font-semibold text-navy">📊 Évolution par attribut (90j)</div>
        <select
          value={attribute}
          onChange={e => setAttribute(e.target.value)}
          className="text-xs border border-border rounded-inner px-2 py-1 bg-white"
        >
          {(attrsData?.attributes || []).map(a => (
            <option key={a.key} value={a.key}>{a.label}{a.critical ? ' ⚠️' : ''}</option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-xs text-navy-muted">Chargement…</div>
      ) : !data?.series?.length ? (
        <div className="text-center py-6 text-xs text-navy-muted">
          Aucune modification détectée sur cet attribut dans la période.
        </div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="day" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <ReferenceLine y={data.threshold} stroke="#ef4444" strokeDasharray="3 3"
                             label={{ value: `Seuil 3σ: ${data.threshold}`, fontSize: 10, fill: '#ef4444' }} />
              <Line type="monotone" dataKey="modifications" stroke="#1e3a8a" strokeWidth={2}
                    dot={{ r: 3 }} name="Modifications" />
            </LineChart>
          </ResponsiveContainer>

          {data.anomalies?.length > 0 && (
            <div className="mt-3 bg-warning-bg border border-warning/20 rounded-inner px-3 py-2 text-xs text-warning">
              ⚠️ Pic{data.anomalies.length > 1 ? 's' : ''} suspect{data.anomalies.length > 1 ? 's' : ''} détecté
              {data.anomalies.length > 1 ? 's' : ''} :{' '}
              {data.anomalies.slice(0, 3).map(a => `${a.day} (${fNum(a.modifications)})`).join(', ')}
              {data.anomalies.length > 3 && ` …et ${data.anomalies.length - 3} autres`}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Section 5 — Full diffs table ───────────────────────────
function FullDiffsTable({ brand, market }) {
  const [type, setType] = useState('all');
  const [attribute, setAttribute] = useState('all');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const { data: attrsData } = useQuery({
    queryKey: ['feed-monitor', 'attributes'],
    queryFn: () => fetchApi('/api/feed-monitor/attributes'),
    staleTime: 60 * 60 * 1000,
  });

  const params = useMemo(() => ({
    brand, market, type, attribute, search: search || undefined,
    critical_only: criticalOnly ? 'true' : undefined,
    from: from || undefined,
    to: to || undefined,
    limit: 50000, offset: 0,
  }), [brand, market, type, attribute, search, criticalOnly, from, to]);

  const { data, isLoading } = useQuery({
    queryKey: ['feed-monitor', 'diffs-full', params],
    queryFn: () => fetchApi('/api/feed-monitor/diffs', params),
  });

  const rows = data?.rows || [];
  const total = data?.total || 0;

  function exportCsv() {
    const columns = [
      { key: 'product_id',     label: 'ID' },
      { key: 'product_title',  label: 'Titre' },
      { key: 'change_type',    label: 'Type' },
      { key: 'attribute_label',label: 'Attribut' },
      { key: 'old_value',      label: 'Avant' },
      { key: 'new_value',      label: 'Après' },
      { key: 'is_critical_str',label: 'Critique' },
      { key: 'detected_at',    label: 'Détecté' },
    ];
    const data = rows.map(r => ({ ...r, is_critical_str: r.is_critical ? 'oui' : 'non' }));
    downloadCsv(columns, data, `feed-diffs-${brand}-${market}-${Date.now()}.csv`);
  }

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="text-sm font-semibold text-navy">
          Tous les changements détectés
          {total > 0 && <span className="ml-2 text-[11px] font-normal text-navy-muted">({fNum(total)})</span>}
        </div>
        <button
          onClick={exportCsv}
          disabled={!rows.length}
          className="text-xs px-2 py-1 border border-border rounded-inner hover:bg-bg-page disabled:opacity-50"
        >
          Export CSV
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
        <select value={type} onChange={e => setType(e.target.value)} className="border border-border rounded-inner px-2 py-1 bg-white">
          <option value="all">Tous types</option>
          <option value="added">Ajouté</option>
          <option value="removed">Supprimé</option>
          <option value="modified">Modifié</option>
        </select>

        <select value={attribute} onChange={e => setAttribute(e.target.value)} className="border border-border rounded-inner px-2 py-1 bg-white">
          <option value="all">Tous attributs</option>
          {(attrsData?.attributes || []).map(a => (
            <option key={a.key} value={a.key}>{a.label}</option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-navy-muted">
          <input type="checkbox" checked={criticalOnly} onChange={e => setCriticalOnly(e.target.checked)} />
          Critiques uniquement
        </label>

        <input
          type="text"
          placeholder="ID/titre…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-border rounded-inner px-2 py-1 bg-white w-40"
        />
        <input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border border-border rounded-inner px-2 py-1 bg-white" />
        <span className="text-navy-muted">→</span>
        <input type="date" value={to} onChange={e => setTo(e.target.value)} className="border border-border rounded-inner px-2 py-1 bg-white" />
      </div>

      {isLoading ? (
        <div className="text-center py-6 text-xs text-navy-muted">Chargement…</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-6 text-xs text-navy-muted">Aucun résultat.</div>
      ) : (
        <FullDiffsVirtualTable rows={rows} withDetectedAt />
      )}
    </div>
  );
}

function FullDiffsVirtualTable({ rows, withDetectedAt }) {
  const { parentRef, items, paddingTop, paddingBottom } = useRowVirtualizer(rows);
  const colCount = withDetectedAt ? 7 : 6;
  return (
    <div ref={parentRef} className="overflow-auto border border-border rounded-inner" style={{ maxHeight: 560 }}>
      <table className="w-full text-xs">
        <thead className="bg-bg-page text-navy-muted sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium">ID</th>
            <th className="text-left px-2 py-1.5 font-medium">Produit</th>
            <th className="text-left px-2 py-1.5 font-medium">Type</th>
            <th className="text-left px-2 py-1.5 font-medium">Attribut</th>
            <th className="text-left px-2 py-1.5 font-medium">Avant</th>
            <th className="text-left px-2 py-1.5 font-medium">Après</th>
            {withDetectedAt && <th className="text-left px-2 py-1.5 font-medium">Détecté</th>}
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && <tr><td colSpan={colCount} style={{ height: paddingTop }} /></tr>}
          {items.map(v => {
            const r = rows[v.index];
            return (
              <tr key={r.id ?? v.index} className={`border-t border-border hover:bg-bg-page ${r.is_critical ? 'bg-danger-bg/30' : ''}`}>
                <td className="px-2 py-1.5 font-mono text-[10px] text-navy-muted">{r.product_id}</td>
                <td className="px-2 py-1.5 max-w-[260px] truncate" title={r.product_title}>{r.product_title || '—'}</td>
                <td className="px-2 py-1.5">
                  <span className={`text-[10px] font-bold uppercase ${
                    r.change_type === 'ADDED'   ? 'text-success' :
                    r.change_type === 'REMOVED' ? 'text-danger'  : 'text-warning'
                  }`}>{r.change_type}</span>
                </td>
                <td className="px-2 py-1.5">
                  {r.attribute_label || '—'}
                  {r.is_critical && <span className="ml-1 text-danger">⚠️</span>}
                </td>
                <td className="px-2 py-1.5 text-navy-muted line-through max-w-[180px] truncate" title={r.old_value}>{r.old_value || ''}</td>
                <td className="px-2 py-1.5 max-w-[180px] truncate" title={r.new_value}>{r.new_value || ''}</td>
                {withDetectedAt && <td className="px-2 py-1.5 text-navy-muted">{formatRelativeTime(r.detected_at)}</td>}
              </tr>
            );
          })}
          {paddingBottom > 0 && <tr><td colSpan={colCount} style={{ height: paddingBottom }} /></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ─── Section 6 — Auto insights ──────────────────────────────
function InsightsCard({ summary }) {
  const last = summary?.last_snapshot;

  const insights = useMemo(() => {
    const out = [];
    if (!last) return out;
    const trend = summary?.trend || [];

    // Critical changes alert
    if (last.critical_changes > 0) {
      out.push({
        icon: '🚨',
        tone: last.critical_changes > 50 ? 'danger' : 'warning',
        text: `${fNum(last.critical_changes)} changement${last.critical_changes > 1 ? 's' : ''} critique${last.critical_changes > 1 ? 's' : ''} détecté${last.critical_changes > 1 ? 's' : ''} aujourd'hui — surveillance recommandée.`,
      });
    }

    // Trend average
    if (trend.length >= 3) {
      const totalMods = trend.reduce((s, t) => s + (t.modified || 0) + (t.critical || 0), 0);
      const avg = totalMods / trend.length;
      const todayMods = (trend[trend.length - 1]?.modified || 0) + (trend[trend.length - 1]?.critical || 0);
      const avgPct = last.total_products > 0 ? ((avg / last.total_products) * 100).toFixed(1) : 0;
      const todayPct = last.total_products > 0 ? ((todayMods / last.total_products) * 100).toFixed(1) : 0;
      out.push({
        icon: '📊',
        tone: 'info',
        text: `Tendance : ${avgPct}% du catalogue modifié en moyenne par jour. Aujourd'hui : ${todayPct}%.`,
      });
    }

    if (!out.length) {
      out.push({ icon: '✅', tone: 'success', text: 'Aucune anomalie détectée — le flux est stable.' });
    }
    return out;
  }, [last, summary]);

  if (!last) return null;

  const toneClasses = {
    danger:  'bg-danger-bg border-danger/20 text-danger',
    warning: 'bg-warning-bg border-warning/20 text-warning',
    info:    'bg-bg-page border-border text-navy',
    success: 'bg-success-bg border-success/20 text-success',
  };

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="text-sm font-semibold text-navy mb-3">💡 Insights</div>
      <div className="space-y-2">
        {insights.map((i, idx) => (
          <div key={idx} className={`rounded-inner border px-3 py-2 text-xs ${toneClasses[i.tone]}`}>
            <span className="mr-1.5">{i.icon}</span>{i.text}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Import & compare a CSV/XLSX feed snapshot ──────────────
// Maps common header variations to canonical attribute keys.
const HEADER_ALIASES = {
  id: 'id', offer_id: 'id', offerid: 'id', sku: 'id', 'product id': 'id', product_id: 'id',
  title: 'title', name: 'title',
  brand: 'brand', marque: 'brand',
  product_type: 'product_type', 'product type': 'product_type',
  google_product_category: 'google_product_category',
  'google product category': 'google_product_category',
  custom_label_0: 'custom_label_0', custom_label_1: 'custom_label_1',
  custom_label_2: 'custom_label_2', custom_label_3: 'custom_label_3',
  custom_label_4: 'custom_label_4',
  'custom label 0': 'custom_label_0', 'custom label 1': 'custom_label_1',
  'custom label 2': 'custom_label_2', 'custom label 3': 'custom_label_3',
  'custom label 4': 'custom_label_4',
  availability: 'availability', disponibilite: 'availability',
  condition: 'condition', etat: 'condition',
  price: 'price', prix: 'price',
  sale_price: 'sale_price', 'sale price': 'sale_price',
  description: 'description',
  image_link: 'image_link', 'image link': 'image_link',
  gtin: 'gtin', mpn: 'mpn',
};

function normalizeHeader(h) {
  const k = String(h || '').trim().toLowerCase();
  return HEADER_ALIASES[k] || k.replace(/\s+/g, '_');
}

async function parseFile(file) {
  const XLSX = await import('xlsx');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Lecture du fichier impossible'));
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
        if (!rows.length) return reject(new Error('Fichier vide'));

        const sample = rows[0];
        const mapping = {};
        for (const key of Object.keys(sample)) {
          mapping[key] = normalizeHeader(key);
        }
        const idCol = Object.entries(mapping).find(([, v]) => v === 'id')?.[0];
        if (!idCol) {
          return reject(new Error('Colonne "id" introuvable. Renommez la colonne identifiant en "id".'));
        }

        const products = rows.map(row => {
          const out = {};
          for (const [origKey, normKey] of Object.entries(mapping)) {
            const val = row[origKey];
            if (val !== '' && val != null) out[normKey] = String(val);
          }
          return out;
        }).filter(p => p.id);

        resolve(products);
      } catch (err) {
        reject(err);
      }
    };
    reader.readAsArrayBuffer(file);
  });
}

// ─── Manual mode — same insights driven by an imported file ────
function ManualUploader({ brand, market, onResult, result, isLoading, error, onReset, filename, productCount }) {
  const fileInputRef = useRef(null);

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-sm font-semibold text-navy">📥 Importer un ancien flux (CSV / XLSX)</div>
          <div className="text-[11px] text-navy-muted mt-0.5">
            Le fichier est traité comme la version <strong>« avant »</strong> et comparé au snapshot courant en base. Aucune écriture dans l&apos;historique.
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.tsv"
          onChange={onResult}
          className="text-xs file:mr-2 file:px-2 file:py-1 file:border file:border-border file:rounded-inner file:bg-bg-page file:text-navy hover:file:bg-white"
        />
        {filename && (
          <span className="text-[11px] text-navy-muted">
            {filename}{productCount != null ? ` — ${fNum(productCount)} produits` : ''}
          </span>
        )}
        {isLoading && (
          <span className="text-[11px] text-warning">Comparaison en cours…</span>
        )}
        {(filename || result) && (
          <button
            onClick={() => { if (fileInputRef.current) fileInputRef.current.value = ''; onReset(); }}
            className="text-xs px-2 py-1 border border-border rounded-inner hover:bg-bg-page ml-auto"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {error && (
        <div className="mt-3 bg-danger-bg border border-danger/20 rounded-inner px-3 py-2 text-xs text-danger">
          {error}
        </div>
      )}

      <div className="mt-3 text-[10px] text-navy-muted">
        Format attendu : ligne d&apos;en-tête + au moins une colonne <code className="bg-bg-page px-1 rounded">id</code>. Les colonnes
        reconnues sont <code className="bg-bg-page px-1 rounded">brand</code>,
        <code className="bg-bg-page px-1 rounded ml-1">title</code>,
        <code className="bg-bg-page px-1 rounded ml-1">custom_label_0..4</code>,
        <code className="bg-bg-page px-1 rounded ml-1">availability</code>, etc. Brand={brand}, Market={market}.
      </div>
    </div>
  );
}

function ManualSummaryCard({ result }) {
  if (!result) return null;
  const s = result.summary;
  const stk = result.stock;
  const criticalAlert = (s.critical_changes || 0) > 50;
  const oosAlert = (stk?.transitions_to_out || 0) > 50;
  const inDelta = stk ? stk.current.in_stock - stk.imported.in_stock : null;

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="mb-3">
        <div className="text-sm text-navy-muted">Comparaison fichier importé vs snapshot courant</div>
        <div className="text-base font-semibold text-navy mt-0.5">
          {fNum(s.imported_unique)} produits dans le fichier · {fNum(s.current_count)} produits dans le snapshot
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-navy-muted mb-1.5 font-bold">Changements</div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <SubCard icon="➕" label="Ajoutés (depuis l'import)"   value={s.added}    accent="text-success" />
            <SubCard icon="➖" label="Supprimés (depuis l'import)" value={s.removed}  accent="text-danger" />
            <SubCard icon="🔄" label="Produits modifiés"           value={s.modified_products} accent="text-navy" />
            <SubCard
              icon="🚨"
              label="Attributs critiques modifiés"
              value={s.critical_changes}
              accent={criticalAlert ? 'text-danger animate-pulse' : 'text-warning'}
              alert={criticalAlert}
            />
          </div>
        </div>

        {stk && (
          <div>
            <div className="text-[10px] uppercase tracking-wider text-navy-muted mb-1.5 font-bold">Stock — snapshot courant</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <SubCard
                icon="📦"
                label="Total catalogue"
                value={stk.current.total}
                accent="text-navy"
              />
              <SubCard
                icon="✅"
                label="En stock"
                value={stk.current.in_stock}
                sub={inDelta != null && inDelta !== 0
                  ? `${inDelta > 0 ? '+' : ''}${fNum(inDelta)} vs fichier`
                  : null}
                accent="text-success"
              />
              <SubCard
                icon="🚫"
                label="Out of stock"
                value={stk.current.out_of_stock}
                accent="text-danger"
              />
              <SubCard
                icon="📉"
                label="Passés OOS depuis l'import"
                value={stk.transitions_to_out}
                sub={(stk.transitions_to_in || 0) > 0
                  ? `↩️ ${fNum(stk.transitions_to_in)} repassés en stock`
                  : null}
                accent={oosAlert ? 'text-danger animate-pulse' : 'text-warning'}
                alert={oosAlert}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ManualCriticalTable({ result }) {
  const [attribute, setAttribute] = useState('all');
  const [search, setSearch] = useState('');

  const { data: attrsData } = useQuery({
    queryKey: ['feed-monitor', 'attributes'],
    queryFn: () => fetchApi('/api/feed-monitor/attributes'),
    staleTime: 60 * 60 * 1000,
  });

  const allCritical = useMemo(
    () => (result?.modified || []).filter(m => m.is_critical),
    [result],
  );

  const filtered = useMemo(() => {
    return allCritical.filter(r => {
      if (attribute !== 'all' && r.attribute !== attribute) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!String(r.product_id).toLowerCase().includes(q) &&
            !String(r.product_title || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allCritical, attribute, search]);

  const criticalAttrs = (attrsData?.attributes || []).filter(a => a.critical);

  if (!result) return null;

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div className="text-sm font-semibold text-navy">
          🚨 Changements critiques détectés
          {allCritical.length > 0 && (
            <span className="ml-2 text-[11px] font-normal text-navy-muted">
              ({fNum(filtered.length)}{filtered.length !== allCritical.length ? ` / ${fNum(allCritical.length)}` : ''})
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select value={attribute} onChange={e => setAttribute(e.target.value)} className="text-xs border border-border rounded-inner px-2 py-1 bg-white">
            <option value="all">Tous attributs critiques</option>
            {criticalAttrs.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
          </select>
          <input type="text" placeholder="Chercher ID/titre…" value={search} onChange={e => setSearch(e.target.value)}
                 className="text-xs border border-border rounded-inner px-2 py-1 bg-white w-48" />
        </div>
      </div>

      {allCritical.length === 0 ? (
        <div className="text-center py-6 text-xs text-navy-muted">
          ✅ Aucun changement critique entre le fichier et le snapshot courant.
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-6 text-xs text-navy-muted">Aucun résultat pour ces filtres.</div>
      ) : (
        <ManualCriticalVirtualTable rows={filtered} />
      )}
    </div>
  );
}

function ManualCriticalVirtualTable({ rows }) {
  const { parentRef, items, paddingTop, paddingBottom } = useRowVirtualizer(rows);
  return (
    <div ref={parentRef} className="overflow-auto border border-border rounded-inner" style={{ maxHeight: 480 }}>
      <table className="w-full text-xs">
        <thead className="bg-bg-page text-navy-muted sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.06)]">
          <tr>
            <th className="text-left px-2 py-1.5 font-medium">ID</th>
            <th className="text-left px-2 py-1.5 font-medium">Produit</th>
            <th className="text-left px-2 py-1.5 font-medium">Attribut</th>
            <th className="text-left px-2 py-1.5 font-medium">Avant (fichier)</th>
            <th className="text-left px-2 py-1.5 font-medium">Après (snapshot)</th>
          </tr>
        </thead>
        <tbody>
          {paddingTop > 0 && <tr><td colSpan={5} style={{ height: paddingTop }} /></tr>}
          {items.map(v => {
            const r = rows[v.index];
            return (
              <tr key={v.index} className="border-t border-border hover:bg-bg-page">
                <td className="px-2 py-1.5 font-mono text-[10px] text-navy-muted">{r.product_id}</td>
                <td className="px-2 py-1.5 max-w-[280px] truncate" title={r.product_title}>{r.product_title || '—'}</td>
                <td className="px-2 py-1.5"><span className="text-[10px] font-bold text-danger uppercase">{r.attribute_label}</span></td>
                <td className="px-2 py-1.5 text-navy-muted line-through max-w-[200px] truncate" title={r.old_value}>{r.old_value || '∅'}</td>
                <td className="px-2 py-1.5 max-w-[200px] truncate" title={r.new_value}>{r.new_value || '∅'}</td>
              </tr>
            );
          })}
          {paddingBottom > 0 && <tr><td colSpan={5} style={{ height: paddingBottom }} /></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ManualAttributeBreakdown({ result }) {
  const breakdown = useMemo(() => {
    if (!result) return [];
    const counts = {};
    for (const m of (result.modified || [])) {
      const key = m.attribute_label || m.attribute;
      if (!counts[key]) counts[key] = { attribute: key, count: 0, is_critical: m.is_critical };
      counts[key].count++;
    }
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 20);
  }, [result]);

  if (!result || breakdown.length === 0) return null;

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="text-sm font-semibold text-navy mb-3">📊 Modifications par attribut</div>
      <ResponsiveContainer width="100%" height={Math.max(220, breakdown.length * 22)}>
        <BarChart data={breakdown} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis type="number" tick={{ fontSize: 10 }} />
          <YAxis type="category" dataKey="attribute" tick={{ fontSize: 10 }} width={140} />
          <Tooltip />
          <Bar dataKey="count" name="Modifications">
            {breakdown.map((b, i) => (
              <Cell key={i} fill={b.is_critical ? '#b91c1c' : '#1e3a8a'} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ManualFullDiffsTable({ result }) {
  const [type, setType] = useState('all');
  const [attribute, setAttribute] = useState('all');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [search, setSearch] = useState('');

  const { data: attrsData } = useQuery({
    queryKey: ['feed-monitor', 'attributes'],
    queryFn: () => fetchApi('/api/feed-monitor/attributes'),
    staleTime: 60 * 60 * 1000,
  });

  const allRows = useMemo(() => {
    if (!result) return [];
    const rows = [];
    for (const r of (result.added || []))    rows.push({ ...r, change_type: 'ADDED',    is_critical: false });
    for (const r of (result.removed || []))  rows.push({ ...r, change_type: 'REMOVED',  is_critical: false });
    for (const r of (result.modified || [])) rows.push({ ...r, change_type: 'MODIFIED' });
    return rows;
  }, [result]);

  const filtered = useMemo(() => {
    return allRows.filter(r => {
      if (type !== 'all' && r.change_type !== type.toUpperCase()) return false;
      if (attribute !== 'all' && r.attribute !== attribute) return false;
      if (criticalOnly && !r.is_critical) return false;
      if (search) {
        const q = search.toLowerCase();
        if (!String(r.product_id).toLowerCase().includes(q) &&
            !String(r.product_title || '').toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [allRows, type, attribute, criticalOnly, search]);

  function exportCsv() {
    const columns = [
      { key: 'product_id',     label: 'ID' },
      { key: 'product_title',  label: 'Titre' },
      { key: 'change_type',    label: 'Type' },
      { key: 'attribute_label',label: 'Attribut' },
      { key: 'old_value',      label: 'Avant' },
      { key: 'new_value',      label: 'Après' },
      { key: 'is_critical_str',label: 'Critique' },
    ];
    const data = filtered.map(r => ({ ...r, is_critical_str: r.is_critical ? 'oui' : 'non' }));
    downloadCsv(columns, data, `feed-import-diffs-${Date.now()}.csv`);
  }

  if (!result) return null;

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <div className="text-sm font-semibold text-navy">
          Tous les changements détectés
          {filtered.length > 0 && (
            <span className="ml-2 text-[11px] font-normal text-navy-muted">
              ({fNum(filtered.length)}{filtered.length !== allRows.length ? ` / ${fNum(allRows.length)}` : ''})
            </span>
          )}
        </div>
        <button onClick={exportCsv} disabled={!filtered.length}
                className="text-xs px-2 py-1 border border-border rounded-inner hover:bg-bg-page disabled:opacity-50">
          Export CSV
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap mb-3 text-xs">
        <select value={type} onChange={e => setType(e.target.value)} className="border border-border rounded-inner px-2 py-1 bg-white">
          <option value="all">Tous types</option>
          <option value="added">Ajouté</option>
          <option value="removed">Supprimé</option>
          <option value="modified">Modifié</option>
        </select>
        <select value={attribute} onChange={e => setAttribute(e.target.value)} className="border border-border rounded-inner px-2 py-1 bg-white">
          <option value="all">Tous attributs</option>
          {(attrsData?.attributes || []).map(a => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-navy-muted">
          <input type="checkbox" checked={criticalOnly} onChange={e => setCriticalOnly(e.target.checked)} />
          Critiques uniquement
        </label>
        <input type="text" placeholder="ID/titre…" value={search} onChange={e => setSearch(e.target.value)}
               className="border border-border rounded-inner px-2 py-1 bg-white w-40" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-6 text-xs text-navy-muted">Aucun résultat.</div>
      ) : (
        <FullDiffsVirtualTable rows={filtered} withDetectedAt={false} />
      )}
    </div>
  );
}

function ManualInsightsCard({ result }) {
  const insights = useMemo(() => {
    if (!result) return [];
    const out = [];
    const s = result.summary;

    if (s.critical_changes > 0) {
      out.push({
        icon: '🚨',
        tone: s.critical_changes > 50 ? 'danger' : 'warning',
        text: `${fNum(s.critical_changes)} changement${s.critical_changes > 1 ? 's' : ''} critique${s.critical_changes > 1 ? 's' : ''} détecté${s.critical_changes > 1 ? 's' : ''} vs le fichier importé.`,
      });
    }

    if (s.added > 0 || s.removed > 0) {
      out.push({
        icon: '🔁',
        tone: 'info',
        text: `Catalogue : ${fNum(s.added)} ajout${s.added > 1 ? 's' : ''}, ${fNum(s.removed)} suppression${s.removed > 1 ? 's' : ''} depuis la version importée.`,
      });
    }

    if (s.imported_unique > 0) {
      const pct = ((s.modified_products / s.imported_unique) * 100).toFixed(1);
      out.push({
        icon: '📊',
        tone: 'info',
        text: `${pct}% des produits du fichier ont au moins un attribut modifié dans le snapshot courant.`,
      });
    }

    if (!out.length) {
      out.push({ icon: '✅', tone: 'success', text: 'Le fichier importé correspond parfaitement au snapshot courant.' });
    }
    return out;
  }, [result]);

  if (!result) return null;

  const toneClasses = {
    danger:  'bg-danger-bg border-danger/20 text-danger',
    warning: 'bg-warning-bg border-warning/20 text-warning',
    info:    'bg-bg-page border-border text-navy',
    success: 'bg-success-bg border-success/20 text-success',
  };

  return (
    <div className="bg-white border border-border rounded-card shadow-card p-5 mb-4">
      <div className="text-sm font-semibold text-navy mb-3">💡 Insights</div>
      <div className="space-y-2">
        {insights.map((i, idx) => (
          <div key={idx} className={`rounded-inner border px-3 py-2 text-xs ${toneClasses[i.tone]}`}>
            <span className="mr-1.5">{i.icon}</span>{i.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function ManualMode({ brand, market }) {
  const [filename, setFilename] = useState(null);
  const [products, setProducts] = useState([]);
  const [parseError, setParseError] = useState(null);
  const [result, setResult] = useState(null);

  const compareMutation = useMutation({
    mutationFn: async (payload) => {
      const url = new URL('/api/feed-monitor/compare-import', API_URL || window.location.origin);
      const res = await authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      return res.json();
    },
    onSuccess: (data) => setResult(data),
  });

  // Auto-trigger comparison when a file finishes parsing.
  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setParseError(null);
    setResult(null);
    setFilename(file.name);
    try {
      const parsed = await parseFile(file);
      setProducts(parsed);
      compareMutation.mutate({ brand, market, products: parsed });
    } catch (err) {
      setParseError(err.message || 'Erreur lors du parsing');
      setProducts([]);
    }
  }

  function reset() {
    setFilename(null);
    setProducts([]);
    setResult(null);
    setParseError(null);
    compareMutation.reset();
  }

  const error = parseError || (compareMutation.isError ? (compareMutation.error?.message || 'Erreur') : null);

  return (
    <div className="space-y-6">
      <ManualUploader
        brand={brand}
        market={market}
        onResult={handleFile}
        result={result}
        isLoading={compareMutation.isPending}
        error={error}
        onReset={reset}
        filename={filename}
        productCount={products.length || null}
      />

      {result && (
        <>
          <ManualSummaryCard result={result} />
          <ManualCriticalTable result={result} />
          <AccordionSection title="Modifications par attribut" badge="Analyse" isOpenDefault={false}>
            <ManualAttributeBreakdown result={result} />
          </AccordionSection>
          <AccordionSection title="Tableau complet des changements" badge="Détail" isOpenDefault={false}>
            <ManualFullDiffsTable result={result} />
          </AccordionSection>
          <ManualInsightsCard result={result} />

          {(result.truncated?.added || result.truncated?.removed || result.truncated?.modified) && (
            <div className="bg-warning-bg border border-warning/20 rounded-inner px-3 py-2 text-xs text-warning">
              ⚠️ Résultats tronqués à 2000 lignes par catégorie côté backend — la base contient plus de différences. Affinez le périmètre du fichier importé pour voir l&apos;intégralité.
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AutoMode({ brand, market }) {
  const summaryQuery = useQuery({
    queryKey: ['feed-monitor', 'summary', brand, market],
    queryFn: () => fetchApi('/api/feed-monitor/summary', { brand, market, days: 7 }),
    refetchInterval: 60 * 1000,
  });

  return (
    <div className="space-y-6">
      <LastSnapshotCard
        summary={summaryQuery.data}
        isLoading={summaryQuery.isLoading}
        brand={brand}
        market={market}
        onTriggered={() => summaryQuery.refetch()}
      />
      <TrendChart trend={summaryQuery.data?.trend} />
      <CriticalChangesTable brand={brand} market={market} />
      <AccordionSection title="Évolution par attribut" badge="Analyse" isOpenDefault={false}>
        <AttributeDeepDive brand={brand} market={market} />
      </AccordionSection>
      <AccordionSection title="Tableau complet des changements" badge="Détail" isOpenDefault={false}>
        <FullDiffsTable brand={brand} market={market} />
      </AccordionSection>
      <InsightsCard summary={summaryQuery.data} />
    </div>
  );
}

const MODES = [
  { key: 'auto',   label: 'Automatique', desc: 'Snapshots quotidiens 7h Paris' },
  { key: 'manual', label: 'Manuel',      desc: 'Comparer un fichier importé au snapshot courant' },
];

// ─── Main view ──────────────────────────────────────────────
export default function FeedMonitorView({ filters }) {
  const brand = BRAND_KEY_MAP[filters?.brand] || 'COCOONCENTER';
  const market = (filters?.market && filters.market !== 'ALL') ? filters.market : 'FR';
  const [mode, setMode] = useState('auto');

  const brandLabel = BRAND_LABEL[brand] || brand;
  const activeMode = MODES.find(m => m.key === mode);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-navy">Feed Monitor</h2>
        <p className="text-xs text-navy-muted mt-0.5">
          Détecteur de changements dans le flux Merchant Center —{' '}
          <strong>{brandLabel}</strong> / {market}
          {filters?.brand === 'ALL' && (
            <span className="ml-2 text-warning">
              ⚠️ Sélectionnez une marque dans le header pour cibler le suivi (par défaut : Cocooncenter).
            </span>
          )}
        </p>
      </div>

      {/* Mode toggle */}
      <div className="bg-white rounded-card p-4 border border-border shadow-card flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-navy-muted">Mode</span>
          <div className="flex gap-1 ml-2">
            {MODES.map((m) => {
              const active = mode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setMode(m.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-inner border transition-colors ${
                    active
                      ? 'bg-navy text-white border-navy'
                      : 'bg-white text-navy-muted border-border hover:border-navy/40'
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
        </div>
        <div className="text-[11px] text-navy-muted">{activeMode?.desc}</div>
      </div>

      {mode === 'auto'   && <AutoMode   brand={brand} market={market} />}
      {mode === 'manual' && <ManualMode brand={brand} market={market} />}
    </div>
  );
}
