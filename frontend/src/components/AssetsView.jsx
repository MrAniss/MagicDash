import { useState, useEffect } from 'react';

// ─── Constants ─────────────────────────────────────────

const ASSET_CONSTRAINTS = {
  RSA_TITLE:       { maxChars: 30, count: { min: 3, max: 15 }, label: 'Titres RSA' },
  RSA_DESCRIPTION: { maxChars: 90, count: { min: 2, max: 4  }, label: 'Descriptions RSA' },
  PMAX_TITLE:      { maxChars: 30, count: { min: 3, max: 5  }, label: 'Titres PMax' },
  PMAX_TITLE_LONG: { maxChars: 90, count: { min: 1, max: 5  }, label: 'Titres longs PMax' },
  PMAX_DESC:       { maxChars: 90, count: { min: 2, max: 5  }, label: 'Descriptions PMax' },
  PROMO_TEXT:      { maxChars: 60, count: { min: 1, max: 10 }, label: 'Textes promotionnels' },
};

const MARKET_LANGUAGES = {
  FR: { lang: 'fr', label: 'Français',        flag: '🇫🇷' },
  BE: { lang: 'fr', label: 'Français (BE)',   flag: '🇧🇪' },
  NL: { lang: 'nl', label: 'Néerlandais',     flag: '🇳🇱' },
  DE: { lang: 'de', label: 'Allemand',        flag: '🇩🇪' },
  IT: { lang: 'it', label: 'Italien',         flag: '🇮🇹' },
  ES: { lang: 'es', label: 'Espagnol',        flag: '🇪🇸' },
  UK: { lang: 'en', label: 'Anglais',         flag: '🇬🇧' },
  AT: { lang: 'de', label: 'Allemand (AT)',   flag: '🇦🇹' },
  PT: { lang: 'pt', label: 'Portugais',       flag: '🇵🇹' },
  LU: { lang: 'fr', label: 'Français (LU)',   flag: '🇱🇺' },
  SE: { lang: 'sv', label: 'Suédois',         flag: '🇸🇪' },
  NO: { lang: 'no', label: 'Norvégien',       flag: '🇳🇴' },
  FI: { lang: 'fi', label: 'Finnois',         flag: '🇫🇮' },
  PL: { lang: 'pl', label: 'Polonais',        flag: '🇵🇱' },
  IE: { lang: 'en', label: 'Anglais (IE)',    flag: '🇮🇪' },
  RO: { lang: 'ro', label: 'Roumain',         flag: '🇷🇴' },
  SA: { lang: 'ar', label: 'Arabe',           flag: '🇸🇦' },
  CA: { lang: 'fr', label: 'Français (CA)',   flag: '🇨🇦' },
  AU: { lang: 'en', label: 'Anglais (AU)',    flag: '🇦🇺' },
  US: { lang: 'en', label: 'Anglais (US)',    flag: '🇺🇸' },
};

const BRANDS         = ['Cocooncenter', 'Pascal Coste', 'Parapharmacie Lafayette'];
const CAMPAIGN_TYPES = ['RSA', 'PMAX'];

const TYPES_BY_CAMPAIGN = {
  RSA:  ['RSA_TITLE', 'RSA_DESCRIPTION'],
  PMAX: ['PMAX_TITLE', 'PMAX_TITLE_LONG', 'PMAX_DESC', 'PROMO_TEXT'],
};

// ─── Helpers ───────────────────────────────────────────

function charColorClass(len, max) {
  const r = len / max;
  if (r > 0.95) return 'text-danger';
  if (r > 0.80) return 'text-warning';
  return 'text-success';
}

async function refreshDetail(groupId) {
  const res = await fetch(`/api/assets/groups/${groupId}`);
  return res.json();
}

// ─── AssetField ────────────────────────────────────────

function AssetField({ asset, maxChars, onSave, onApprove, onDelete, onRegenerate, isBase }) {
  const [content, setContent]   = useState(asset.content);
  const [saving,  setSaving]    = useState(false);
  const [regen,   setRegen]     = useState(false);

  useEffect(() => { setContent(asset.content); }, [asset.content]);

  async function handleBlur() {
    if (content === asset.content) return;
    setSaving(true);
    await onSave(asset.id, content);
    setSaving(false);
  }

  async function handleRegen() {
    setRegen(true);
    const updated = await onRegenerate(asset.id);
    if (updated?.content) setContent(updated.content);
    setRegen(false);
  }

  const isRTL = asset.language === 'ar';
  const over  = content.length > maxChars;

  return (
    <div className="group/asset mb-2">
      <div className={`flex items-start border rounded-inner transition-colors ${over ? 'border-danger/50 bg-danger-bg/20' : 'border-border focus-within:border-navy/40'}`}>
        <textarea
          className="flex-1 px-3 py-2 text-sm text-navy bg-transparent resize-none outline-none leading-5"
          value={content}
          onChange={e => setContent(e.target.value)}
          onBlur={handleBlur}
          dir={isRTL ? 'rtl' : 'ltr'}
          rows={content.length > 55 ? 2 : 1}
        />
        <div className="flex items-center gap-1.5 px-2.5 py-2 shrink-0">
          {saving && <span className="text-[10px] text-navy-muted animate-pulse">saving</span>}
          <span className={`text-[11px] font-mono ${charColorClass(content.length, maxChars)}`}>
            {content.length}/{maxChars} {over ? '✗' : '✓'}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-1 h-5 opacity-0 group-hover/asset:opacity-100 transition-opacity">
        {!isBase && (
          <button
            onClick={handleRegen}
            disabled={regen}
            className="px-2 py-0.5 text-[11px] text-navy-muted hover:text-navy bg-bg-page rounded transition-colors disabled:opacity-40">
            {regen ? '...' : '↺ Régénérer'}
          </button>
        )}
        <button
          onClick={() => onApprove(asset.id)}
          className={`px-2 py-0.5 text-[11px] rounded transition-colors ${asset.is_approved ? 'text-success bg-success-bg/60 hover:bg-success-bg' : 'text-navy-muted bg-bg-page hover:text-success'}`}>
          {asset.is_approved ? '✓ Approuvé' : '◯ Approuver'}
        </button>
        <button
          onClick={() => onDelete(asset.id)}
          className="ml-auto px-2 py-0.5 text-[11px] text-navy-muted hover:text-danger bg-bg-page rounded transition-colors">
          ✕
        </button>
      </div>
    </div>
  );
}

// ─── NewAssetField ─────────────────────────────────────

function NewAssetField({ type, maxChars, language, onAdd }) {
  const [content, setContent] = useState('');
  const isRTL = language === 'ar';

  function submit() {
    if (!content.trim()) return;
    onAdd(type, content.trim());
    setContent('');
  }

  return (
    <div className={`flex items-center border border-dashed rounded-inner transition-colors ${content ? 'border-navy/30' : 'border-border/60 hover:border-border'}`}>
      <input
        type="text"
        className="flex-1 px-3 py-2 text-sm text-navy bg-transparent outline-none placeholder:text-navy-muted/40"
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
        placeholder="+ Ajouter... (Entrée pour valider)"
        dir={isRTL ? 'rtl' : 'ltr'}
      />
      {content && (
        <>
          <span className={`text-[11px] font-mono px-2 shrink-0 ${charColorClass(content.length, maxChars)}`}>
            {content.length}/{maxChars}
          </span>
          <button onClick={submit} className="px-3 py-2 text-xs font-medium text-navy hover:bg-bg-page rounded-r-inner transition-colors">
            +
          </button>
        </>
      )}
    </div>
  );
}

// ─── AssetSection ──────────────────────────────────────

function AssetSection({ type, assets, language, onSave, onApprove, onDelete, onRegenerate, onAdd, isBase }) {
  const c   = ASSET_CONSTRAINTS[type];
  if (!c) return null;
  const cnt = assets.length;
  const countOk = cnt >= c.count.min && cnt <= c.count.max;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-navy">{c.label}</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${countOk ? 'text-success bg-success-bg/50' : cnt > c.count.max ? 'text-danger bg-danger-bg/50' : 'text-warning bg-warning-bg/50'}`}>
          {cnt}/{c.count.max}
        </span>
        <span className="text-[11px] text-navy-muted">max {c.maxChars} car.</span>
      </div>
      {assets.map(a => (
        <AssetField
          key={a.id}
          asset={a}
          maxChars={c.maxChars}
          onSave={onSave}
          onApprove={onApprove}
          onDelete={onDelete}
          onRegenerate={onRegenerate}
          isBase={isBase}
        />
      ))}
      {cnt < c.count.max && (
        <NewAssetField type={type} maxChars={c.maxChars} language={language} onAdd={onAdd} />
      )}
    </div>
  );
}

// ─── NewGroupModal ─────────────────────────────────────

function NewGroupModal({ onClose, onCreate }) {
  const [name,         setName]         = useState('');
  const [brand,        setBrand]        = useState('Cocooncenter');
  const [campaignType, setCampaignType] = useState('RSA');
  const [loading,      setLoading]      = useState(false);

  async function handleCreate() {
    if (!name.trim()) return;
    setLoading(true);
    await onCreate({ name: name.trim(), brand, campaign_type: campaignType });
    setLoading(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 backdrop-blur-sm">
      <div className="bg-white rounded-card shadow-xl w-[420px] p-6 border border-border">
        <h3 className="text-lg font-semibold text-navy mb-5">Nouveau groupe d'assets</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-navy-muted mb-1.5">Nom du groupe</label>
            <input
              autoFocus
              type="text"
              className="w-full px-3 py-2 text-sm border border-border rounded-inner outline-none focus:border-navy/40"
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="ex : Cocooncenter — RSA Acquisition FR"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-muted mb-1.5">Marque</label>
            <select
              className="w-full px-3 py-2 text-sm border border-border rounded-inner outline-none bg-white"
              value={brand}
              onChange={e => setBrand(e.target.value)}>
              {BRANDS.map(b => <option key={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-navy-muted mb-1.5">Type de campagne</label>
            <div className="flex gap-2">
              {CAMPAIGN_TYPES.map(t => (
                <button
                  key={t}
                  onClick={() => setCampaignType(t)}
                  className={`flex-1 py-2 text-sm font-medium rounded-inner border transition-colors ${campaignType === t ? 'bg-navy text-white border-navy' : 'border-border text-navy-muted hover:text-navy'}`}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-navy-muted hover:text-navy transition-colors">Annuler</button>
          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="px-4 py-2 text-sm font-medium bg-navy text-white rounded-inner hover:bg-navy/90 disabled:opacity-50 transition-colors">
            {loading ? 'Création...' : 'Créer →'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── GenerateModal ─────────────────────────────────────

function GenerateModal({ group, baseCount, onClose, onGenerate }) {
  const allMarkets = Object.keys(MARKET_LANGUAGES).filter(m => m !== 'FR');
  const [selected, setSelected] = useState(new Set(allMarkets));
  const [loading,  setLoading]  = useState(false);
  const [status,   setStatus]   = useState('');

  function toggle(m) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(m) ? n.delete(m) : n.add(m);
      return n;
    });
  }

  async function handleGenerate() {
    if (!selected.size) return;
    setLoading(true);
    setStatus(`Génération pour ${selected.size} marché(s) via Gemini...`);
    const result = await onGenerate([...selected]);
    if (result?.errors?.length) {
      setStatus(`${result.generated?.length ?? 0} générés · ${result.errors.length} erreur(s)`);
      setTimeout(onClose, 2000);
    } else {
      onClose();
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 backdrop-blur-sm">
      <div className="bg-white rounded-card shadow-xl w-[520px] p-6 border border-border">
        <h3 className="text-lg font-semibold text-navy mb-1">Générer les traductions</h3>
        <p className="text-xs text-navy-muted mb-5">{baseCount} asset(s) source (FR) · {group.campaign_type} · via Gemini</p>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-navy-muted uppercase tracking-wide">Marchés cibles</span>
            <div className="flex gap-3">
              <button onClick={() => setSelected(new Set(allMarkets))} className="text-xs text-navy hover:underline">Tout sélectionner</button>
              <button onClick={() => setSelected(new Set())} className="text-xs text-navy-muted hover:underline">Effacer</button>
            </div>
          </div>
          <div className="grid grid-cols-5 gap-1.5 max-h-52 overflow-y-auto">
            {allMarkets.map(m => {
              const ml = MARKET_LANGUAGES[m];
              const on = selected.has(m);
              return (
                <label
                  key={m}
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-inner border cursor-pointer transition-colors ${on ? 'border-navy bg-navy/5 text-navy' : 'border-border text-navy-muted hover:border-navy/30'}`}>
                  <input type="checkbox" className="hidden" checked={on} onChange={() => toggle(m)} />
                  <span className="text-sm">{ml.flag}</span>
                  <span className="text-xs font-medium">{m}</span>
                </label>
              );
            })}
          </div>
        </div>

        {selected.size > 0 && (
          <div className="flex items-start gap-1.5 px-3 py-2 bg-warning-bg/40 border border-warning/20 rounded-inner mb-4 text-xs text-navy-muted">
            <span className="text-warning shrink-0 mt-0.5">⚠</span>
            Les assets existants seront remplacés pour les {selected.size} marché(s) sélectionné(s).
          </div>
        )}

        {status && <p className="text-xs text-navy-muted mb-3 animate-pulse">{status}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={loading} className="px-4 py-2 text-sm text-navy-muted hover:text-navy disabled:opacity-40 transition-colors">Annuler</button>
          <button
            onClick={handleGenerate}
            disabled={!selected.size || loading}
            className="px-4 py-2 text-sm font-medium bg-navy text-white rounded-inner hover:bg-navy/90 disabled:opacity-50 transition-colors">
            {loading ? 'Génération...' : `Générer → ${selected.size} marché(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ExportModal ───────────────────────────────────────

function ExportModal({ group, onClose }) {
  const presentMarkets = group.assetsByMarket ? Object.keys(group.assetsByMarket) : ['FR'];
  const [markets,      setMarkets]      = useState(new Set(presentMarkets));
  const [approvedOnly, setApprovedOnly] = useState(false);
  const [format,       setFormat]       = useState('csv');
  const [copying,      setCopying]      = useState(false);

  function toggleMarket(m) {
    setMarkets(prev => { const n = new Set(prev); n.has(m) ? n.delete(m) : n.add(m); return n; });
  }

  function buildParams(fmt) {
    return new URLSearchParams({
      group_id:     group.id,
      format:       fmt,
      markets:      [...markets].join(','),
      approved_only: approvedOnly,
    }).toString();
  }

  async function handleExport() {
    if (format === 'csv') {
      window.location.href = `/api/assets/export?${buildParams('csv')}`;
      onClose();
    } else {
      setCopying(true);
      const res    = await fetch(`/api/assets/export?${buildParams('json')}`);
      const assets = await res.json();
      const header = 'Marché\tLangue\tType\tContenu\tCaractères\tApprouvé';
      const rows   = assets.map(a =>
        [a.market, a.language, a.type, a.content, a.char_count, a.is_approved ? 'Oui' : 'Non'].join('\t')
      );
      await navigator.clipboard.writeText(header + '\n' + rows.join('\n'));
      setCopying(false);
      onClose();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 backdrop-blur-sm">
      <div className="bg-white rounded-card shadow-xl w-[460px] p-6 border border-border">
        <h3 className="text-lg font-semibold text-navy mb-5">Exporter les assets</h3>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-navy-muted mb-2">Format</label>
            <div className="flex gap-2">
              {[{ key: 'csv', label: '↓ CSV (Excel)' }, { key: 'sheets', label: '⎘ Google Sheets' }].map(f => (
                <button
                  key={f.key}
                  onClick={() => setFormat(f.key)}
                  className={`flex-1 py-2 text-sm font-medium rounded-inner border transition-colors ${format === f.key ? 'bg-navy text-white border-navy' : 'border-border text-navy-muted hover:text-navy'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-navy-muted mb-2">Marchés ({markets.size})</label>
            <div className="flex flex-wrap gap-1">
              {presentMarkets.map(m => (
                <button
                  key={m}
                  onClick={() => toggleMarket(m)}
                  className={`flex items-center gap-1 px-2 py-1 text-xs rounded-inner border transition-colors ${markets.has(m) ? 'bg-navy text-white border-navy' : 'border-border text-navy-muted hover:border-navy/30'}`}>
                  {MARKET_LANGUAGES[m]?.flag} {m}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={approvedOnly}
              onChange={e => setApprovedOnly(e.target.checked)}
              className="rounded border-border"
            />
            <span className="text-sm text-navy">Approuvés uniquement</span>
          </label>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-navy-muted hover:text-navy transition-colors">Annuler</button>
          <button
            onClick={handleExport}
            disabled={!markets.size || copying}
            className="px-4 py-2 text-sm font-medium bg-navy text-white rounded-inner hover:bg-navy/90 disabled:opacity-50 transition-colors">
            {copying ? 'Copie...' : format === 'csv' ? 'Télécharger' : 'Copier pour Sheets'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main AssetsView ────────────────────────────────────

export default function AssetsView() {
  const [groups,          setGroups]         = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [groupDetail,     setGroupDetail]    = useState(null);
  const [activeMarket,    setActiveMarket]   = useState('FR');
  const [showNewGroup,    setShowNewGroup]   = useState(false);
  const [showGenerate,    setShowGenerate]   = useState(false);
  const [showExport,      setShowExport]     = useState(false);
  const [loadingGroups,   setLoadingGroups]  = useState(false);
  const [loadingDetail,   setLoadingDetail]  = useState(false);

  // ── Fetchers ──────────────────────────────────────────

  async function fetchGroups() {
    setLoadingGroups(true);
    try {
      const res  = await fetch('/api/assets/groups');
      const data = await res.json();
      setGroups(Array.isArray(data) ? data : []);
    } finally {
      setLoadingGroups(false);
    }
  }

  async function loadDetail(id) {
    setLoadingDetail(true);
    try {
      const data = await refreshDetail(id);
      setGroupDetail(data);
    } finally {
      setLoadingDetail(false);
    }
  }

  useEffect(() => { fetchGroups(); }, []);
  useEffect(() => {
    if (selectedGroupId) { loadDetail(selectedGroupId); setActiveMarket('FR'); }
    else setGroupDetail(null);
  }, [selectedGroupId]);

  async function silentRefresh() {
    if (!selectedGroupId) return;
    const data = await refreshDetail(selectedGroupId);
    setGroupDetail(data);
  }

  // ── Group actions ─────────────────────────────────────

  async function handleCreateGroup(body) {
    const res   = await fetch('/api/assets/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const group = await res.json();
    await fetchGroups();
    setSelectedGroupId(group.id);
  }

  async function handleDeleteGroup(id, e) {
    e.stopPropagation();
    if (!confirm('Supprimer ce groupe et tous ses assets ?')) return;
    await fetch(`/api/assets/groups/${id}`, { method: 'DELETE' });
    await fetchGroups();
    if (selectedGroupId === id) { setSelectedGroupId(null); setGroupDetail(null); }
  }

  // ── Asset actions ─────────────────────────────────────

  async function handleSaveAsset(assetId, content) {
    await fetch(`/api/assets/${assetId}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ content }),
    });
    await silentRefresh();
  }

  async function handleApprove(assetId) {
    await fetch(`/api/assets/${assetId}/approve`, { method: 'PUT' });
    await silentRefresh();
  }

  async function handleDeleteAsset(assetId) {
    await fetch(`/api/assets/${assetId}`, { method: 'DELETE' });
    await silentRefresh();
  }

  async function handleRegenerate(assetId) {
    const res = await fetch(`/api/assets/${assetId}/regenerate`, { method: 'POST' });
    const updated = await res.json();
    await silentRefresh();
    return updated;
  }

  async function handleAddAsset(type, content) {
    if (!selectedGroupId) return;
    const ml = MARKET_LANGUAGES[activeMarket];
    await fetch('/api/assets', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        group_id: selectedGroupId,
        market:   activeMarket,
        language: ml?.lang ?? 'fr',
        type,
        content,
        is_base:  activeMarket === 'FR',
      }),
    });
    await silentRefresh();
  }

  async function handleGenerate(targetMarkets) {
    if (!selectedGroupId || !groupDetail) return;
    const baseAssets = groupDetail.assetsByMarket?.FR ?? [];
    const res = await fetch('/api/assets/generate', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        group_id:       selectedGroupId,
        base_assets:    baseAssets.map(a => ({ type: a.type, content: a.content })),
        target_markets: targetMarkets,
        brand:          groupDetail.brand,
        campaign_type:  groupDetail.campaign_type,
      }),
    });
    const result = await res.json();
    await silentRefresh();
    return result;
  }

  // ── Derived state ─────────────────────────────────────

  const groupedByBrand = groups.reduce((acc, g) => {
    (acc[g.brand] ??= []).push(g);
    return acc;
  }, {});

  const allPresent = groupDetail
    ? ['FR', ...Object.keys(groupDetail.assetsByMarket ?? {}).filter(m => m !== 'FR')]
    : ['FR'];

  const activeAssets = groupDetail?.assetsByMarket?.[activeMarket] ?? [];
  const types        = TYPES_BY_CAMPAIGN[groupDetail?.campaign_type] ?? [];
  const baseAssets   = groupDetail?.assetsByMarket?.FR ?? [];

  function marketBadge(market) {
    const assets = groupDetail?.assetsByMarket?.[market] ?? [];
    if (!assets.length)                      return <span className="text-[9px] text-navy-muted/60 ml-0.5">✗</span>;
    if (assets.every(a => a.is_approved))    return <span className="text-[9px] text-success ml-0.5">✓</span>;
    return                                          <span className="text-[9px] text-warning ml-0.5">⚠</span>;
  }

  // ── Render ────────────────────────────────────────────

  return (
    <div className="flex gap-4 items-start">

      {/* ── Sidebar ─────────────────────────────────────── */}
      <div className="w-52 shrink-0 bg-white rounded-card border border-border overflow-hidden sticky top-6" style={{ maxHeight: 'calc(100vh - 130px)' }}>
        <div className="p-3 border-b border-border">
          <button
            onClick={() => setShowNewGroup(true)}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium bg-navy text-white rounded-inner hover:bg-navy/90 transition-colors">
            + Nouveau groupe
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 195px)' }}>
          {loadingGroups && <p className="text-xs text-center text-navy-muted py-6">Chargement...</p>}

          {Object.entries(groupedByBrand).map(([brand, bGroups]) => (
            <div key={brand} className="px-3 pt-3 pb-1">
              <p className="text-[10px] font-semibold text-navy-muted uppercase tracking-wider mb-1 px-1">{brand}</p>
              {bGroups.map(g => (
                <div
                  key={g.id}
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`group/row flex items-center justify-between px-2 py-2 rounded-inner cursor-pointer transition-colors mb-0.5 ${selectedGroupId === g.id ? 'bg-navy text-white' : 'hover:bg-bg-page text-navy'}`}>
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{g.name}</p>
                    <p className={`text-[10px] mt-0.5 ${selectedGroupId === g.id ? 'text-white/60' : 'text-navy-muted'}`}>{g.campaign_type}</p>
                  </div>
                  <button
                    onClick={e => handleDeleteGroup(g.id, e)}
                    className={`opacity-0 group-hover/row:opacity-100 ml-1 shrink-0 text-[11px] px-1 py-0.5 rounded transition-all ${selectedGroupId === g.id ? 'hover:text-danger text-white/50' : 'hover:text-danger text-navy-muted'}`}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ))}

          {!loadingGroups && groups.length === 0 && (
            <p className="text-xs text-navy-muted text-center px-4 py-6 leading-relaxed">
              Aucun groupe.<br />Créez-en un pour commencer.
            </p>
          )}
        </div>
      </div>

      {/* ── Main area ────────────────────────────────────── */}
      <div className="flex-1 min-w-0">

        {/* Empty state */}
        {!groupDetail && !loadingDetail && (
          <div className="bg-white rounded-card border border-border flex items-center justify-center" style={{ height: 'calc(100vh - 200px)' }}>
            <div className="text-center">
              <p className="text-5xl mb-3">📝</p>
              <p className="text-sm font-medium text-navy mb-1">Sélectionnez ou créez un groupe</p>
              <p className="text-xs text-navy-muted">Gérez vos assets RSA et PMax pour tous les marchés</p>
            </div>
          </div>
        )}

        {loadingDetail && (
          <div className="bg-white rounded-card border border-border flex items-center justify-center" style={{ height: '400px' }}>
            <p className="text-sm text-navy-muted">Chargement...</p>
          </div>
        )}

        {groupDetail && !loadingDetail && (
          <div className="bg-white rounded-card border border-border overflow-hidden">

            {/* Header */}
            <div className="px-6 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-navy">{groupDetail.name}</h2>
                <p className="text-xs text-navy-muted mt-0.5">{groupDetail.brand} · {groupDetail.campaign_type}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowGenerate(true)}
                  disabled={baseAssets.length === 0}
                  title={baseAssets.length === 0 ? 'Ajoutez d\'abord les assets FR' : ''}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-navy text-white rounded-inner hover:bg-navy/90 disabled:opacity-40 transition-colors">
                  ✦ Générer traductions
                </button>
                <button
                  onClick={() => setShowExport(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-bg-page text-navy border border-border rounded-inner hover:bg-border transition-colors">
                  ↓ Exporter
                </button>
              </div>
            </div>

            {/* Market tabs */}
            <div className="px-4 py-2.5 border-b border-border flex items-center gap-1 overflow-x-auto bg-bg-page/50">
              {allPresent.map(market => {
                const ml = MARKET_LANGUAGES[market];
                return (
                  <button
                    key={market}
                    onClick={() => setActiveMarket(market)}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-inner whitespace-nowrap transition-colors shrink-0 ${activeMarket === market ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy hover:bg-white'}`}>
                    <span>{ml?.flag}</span>
                    <span>{market}</span>
                    {marketBadge(market)}
                  </button>
                );
              })}
              {/* Unexplored markets */}
              <div className="flex items-center gap-0.5 ml-1 border-l border-border pl-2">
                {Object.keys(MARKET_LANGUAGES)
                  .filter(m => !allPresent.includes(m))
                  .map(m => (
                    <button
                      key={m}
                      onClick={() => setActiveMarket(m)}
                      title={`${MARKET_LANGUAGES[m].flag} ${MARKET_LANGUAGES[m].label}`}
                      className={`px-1.5 py-1 text-[10px] text-navy-muted hover:text-navy hover:bg-white rounded transition-colors ${activeMarket === m ? 'bg-white text-navy font-medium' : ''}`}>
                      {m}
                    </button>
                  ))}
              </div>
            </div>

            {/* Arabic RTL notice */}
            {activeMarket === 'SA' && (
              <div className="mx-5 mt-3 px-3 py-2 bg-warning-bg/40 border border-warning/20 rounded-inner">
                <p className="text-xs text-navy-muted">
                  <strong>🇸🇦 Arabe (RTL)</strong> — Les champs s'affichent droite-à-gauche.
                  Google Ads supporte les assets en arabe pour les campagnes Search et PMax.
                </p>
              </div>
            )}

            {/* Assets */}
            <div className="px-5 py-5" style={{ minHeight: '300px' }}>
              {activeMarket === 'FR' && baseAssets.length === 0 && (
                <div className="text-center py-8 text-navy-muted">
                  <p className="text-3xl mb-2">📝</p>
                  <p className="text-sm font-medium mb-1">Ajoutez les assets source en français</p>
                  <p className="text-xs">Tapez votre texte dans les champs ci-dessous et appuyez sur Entrée.</p>
                </div>
              )}

              {types.map(type => (
                <AssetSection
                  key={type}
                  type={type}
                  assets={activeAssets.filter(a => a.type === type)}
                  language={MARKET_LANGUAGES[activeMarket]?.lang ?? 'fr'}
                  onSave={handleSaveAsset}
                  onApprove={handleApprove}
                  onDelete={handleDeleteAsset}
                  onRegenerate={handleRegenerate}
                  onAdd={handleAddAsset}
                  isBase={activeMarket === 'FR'}
                />
              ))}

              {activeMarket !== 'FR' && activeAssets.length === 0 && (
                <div className="text-center py-10">
                  <p className="text-3xl mb-2">{MARKET_LANGUAGES[activeMarket]?.flag}</p>
                  <p className="text-sm font-medium text-navy mb-1">
                    Aucun asset pour {MARKET_LANGUAGES[activeMarket]?.label}
                  </p>
                  <p className="text-xs text-navy-muted mb-4">
                    Utilisez "Générer traductions" pour créer ces assets automatiquement depuis les assets FR.
                  </p>
                  <button
                    onClick={() => setShowGenerate(true)}
                    disabled={baseAssets.length === 0}
                    className="px-4 py-2 text-sm font-medium bg-navy text-white rounded-inner hover:bg-navy/90 disabled:opacity-40 transition-colors">
                    ✦ Générer pour {MARKET_LANGUAGES[activeMarket]?.flag} {activeMarket}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Modals ──────────────────────────────────────── */}

      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onCreate={handleCreateGroup}
        />
      )}

      {showGenerate && groupDetail && (
        <GenerateModal
          group={groupDetail}
          baseCount={baseAssets.length}
          onClose={() => setShowGenerate(false)}
          onGenerate={handleGenerate}
        />
      )}

      {showExport && groupDetail && (
        <ExportModal
          group={groupDetail}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}
