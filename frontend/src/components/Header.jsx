import { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStatus } from '../hooks/useAdsData';
import { useComarket } from '../contexts/ComarketContext';
import { getPresetRange } from '../utils/dateHelpers';
import { API_URL } from '../utils/api';
import { FlagIcon, marketName } from '../utils/flags';

const BRAND_TABS = [
  { key: 'COCOONCENTER', label: 'Cocooncenter' },
  { key: 'PASCAL_COSTE', label: 'Pascal Coste' },
  { key: 'PARAPHARMACIE_LAFAYETTE', label: 'Para. Lafayette' },
];

const MARKETS_BY_BRAND = {
  ALL:                    ['ALL','FR','BE','NL','DE','IT','ES','UK','AT','PT','LU','SE','NO','FI','PL','IE','RO','SA','CA','AU','US'],
  COCOONCENTER:           ['ALL','FR','BE','NL','DE','IT','ES','UK','AT','PT','LU','SE','NO','FI','PL','IE','RO','SA','CA','AU','US'],
  PASCAL_COSTE:           ['ALL','FR'],
  PARAPHARMACIE_LAFAYETTE:['ALL','FR'],
};

function getAvailableMarkets(brand) {
  return MARKETS_BY_BRAND[brand] || MARKETS_BY_BRAND.ALL;
}

const VIEW_TABS = [
  { key: 'dashboard',       label: 'Dashboard' },
  { key: 'analytics',       label: 'Analytics' },
  { key: 'budget',          label: 'Budget' },
  { key: 'campaigns',       label: 'Campagnes' },
  { key: 'comarket',        label: 'Comarket' },
  // { key: 'competition',  label: 'Concurrence' },   // hidden — en attente
  { key: 'shopping',        label: 'Shopping' },
  // { key: 'assistant',    label: 'Assistant' },      // hidden — quota Gemini API
  { key: 'assets',         label: 'Assets' },
];

const PRESETS = [
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last_week', label: 'Last Week' },
  { key: 'last_month', label: 'Last Month' },
  { key: 'MTD', label: 'MTD' },
  { key: 'QTD', label: 'QTD' },
  { key: 'YTD', label: 'YTD' },
];

const COMPARE_OPTIONS = [
  { key: 'previous_period', label: 'Periode prec.' },
  { key: 'previous_year', label: 'N-1' },
];

function MarketDropdown({ value, onChange, markets }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    function handler(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selected = value || 'ALL';

  return (
    <div ref={ref} className="relative ml-1">
      {/* Trigger */}
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 bg-bg-page border border-border rounded-inner px-2.5 py-1 text-xs text-navy font-medium hover:border-navy-muted outline-none transition-colors"
      >
        {selected === 'ALL' ? (
          <span className="text-navy-muted">🌍</span>
        ) : (
          <FlagIcon market={selected} size={14} />
        )}
        <span>{selected === 'ALL' ? 'Tous les marchés' : marketName(selected)}</span>
        <svg className={`w-3 h-3 text-navy-muted transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown list */}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-border rounded-card shadow-card py-1 min-w-[170px] max-h-72 overflow-y-auto">
          {markets.map(m => (
            <button
              key={m}
              onClick={() => { onChange(m); setOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-bg-page ${selected === m ? 'font-semibold text-navy bg-bg-page' : 'text-navy-muted'}`}
            >
              {m === 'ALL' ? (
                <span className="text-base leading-none">🌍</span>
              ) : (
                <FlagIcon market={m} size={14} />
              )}
              <span>{m === 'ALL' ? 'Tous les marchés' : marketName(m)}</span>
              {selected === m && (
                <svg className="w-3 h-3 text-navy ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header({ filters, onFiltersChange, activeView, onViewChange }) {
  const { data: authData } = useAuthStatus();
  const authenticated = authData?.authenticated;
  const { includeComarket, setIncludeComarket } = useComarket();
  const queryClient = useQueryClient();
  const [refreshState, setRefreshState] = useState('idle'); // idle | loading | success

  function handleBrand(brand) {
    onFiltersChange({ ...filters, brand, market: 'ALL' });
  }

  function handleMarket(market) {
    onFiltersChange({ ...filters, market });
  }

  function handlePreset(preset) {
    const range = getPresetRange(preset);
    onFiltersChange({ ...filters, ...range, preset });
  }

  function handleCompare(compareTo) {
    onFiltersChange({ ...filters, compareTo });
  }

  function handleDateChange(field, value) {
    onFiltersChange({ ...filters, [field]: value, preset: 'custom' });
  }

  async function handleRefresh() {
    if (refreshState === 'loading') return;
    setRefreshState('loading');
    try {
      await fetch(`${API_URL}/api/cache/clear`, { method: 'POST' });
      await queryClient.invalidateQueries();
      setRefreshState('success');
      setTimeout(() => setRefreshState('idle'), 2000);
    } catch {
      setRefreshState('idle');
    }
  }

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-border-strong shadow-header">
      <div className="max-w-[1600px] mx-auto px-6 py-3">
        {/* Top row */}
        <div className={`flex items-center justify-between ${!['budget','competition','shopping','assistant','assets'].includes(activeView) ? 'mb-3' : ''}`}>
          <div className="flex items-center gap-3">
            <img
              src="https://hygie31.com/wp-content/uploads/2024/07/dhygietal-LOGOTYPE-fond-blanc-1024x422.png"
              alt="Dhygietal"
              style={{ height: '32px', width: 'auto' }}
            />
            <span className="text-navy-muted font-normal text-sm">SEA Dashboard</span>
          </div>

          <div className="flex items-center gap-3">
            {/* View tabs */}
            <div className="flex gap-1">
              {VIEW_TABS.map(view => (
                <button key={view.key} onClick={() => onViewChange(view.key)}
                  className={`relative px-3 py-1.5 text-xs font-medium rounded-inner transition-colors ${activeView === view.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy hover:bg-bg-page'}`}>
                  {view.label}
                </button>
              ))}
            </div>

            {authenticated ? (
              <span className="text-xs text-success flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-success" />Connected
              </span>
            ) : (
              <a href="/auth/login" className="text-xs bg-navy text-white px-3 py-1.5 rounded-inner font-medium hover:bg-navy-light transition-colors">
                Connecter Google Ads
              </a>
            )}
          </div>
        </div>

        {/* Bottom row — hidden on views with own controls */}
        {!['budget','competition','shopping','assistant','assets'].includes(activeView) && (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Brand tabs */}
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                {BRAND_TABS.map(tab => (
                  <button key={tab.key} onClick={() => handleBrand(tab.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-inner transition-colors ${filters.brand === tab.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy hover:bg-bg-page'}`}>
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* Market selector */}
              <MarketDropdown
                value={filters.market || 'ALL'}
                onChange={handleMarket}
                markets={getAvailableMarkets(filters.brand)}
              />
            </div>

            {/* Date controls */}
            <div className="flex items-center gap-2">
              <div className="flex bg-bg-page rounded-inner p-0.5">
                {PRESETS.map(p => (
                  <button key={p.key} onClick={() => handlePreset(p.key)}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${filters.preset === p.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                    {p.label}
                  </button>
                ))}
              </div>

              <input type="date" value={filters.from} onChange={e => handleDateChange('from', e.target.value)}
                className="bg-bg-page text-navy text-xs px-2 py-1 rounded-inner border border-border focus:border-navy outline-none" />
              <span className="text-navy-muted text-xs">-</span>
              <input type="date" value={filters.to} onChange={e => handleDateChange('to', e.target.value)}
                className="bg-bg-page text-navy text-xs px-2 py-1 rounded-inner border border-border focus:border-navy outline-none" />

              <div className="flex bg-bg-page rounded-inner p-0.5 ml-2">
                {COMPARE_OPTIONS.map(opt => (
                  <button key={opt.key} onClick={() => handleCompare(opt.key)}
                    className={`px-2 py-1 text-xs font-medium rounded-md transition-colors ${filters.compareTo === opt.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy'}`}>
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Comarket toggle */}
              <button onClick={() => setIncludeComarket(!includeComarket)}
                className={`ml-2 px-2.5 py-1 text-xs font-medium rounded-inner border transition-colors ${includeComarket ? 'bg-warning-bg border-warning text-warning' : 'border-border text-navy-muted hover:text-navy hover:border-navy-muted'}`}>
                {includeComarket ? 'Comarket ON' : 'Comarket OFF'}
              </button>

              {/* Refresh button */}
              <button onClick={handleRefresh} disabled={refreshState === 'loading'}
                className={`ml-1 flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-inner border transition-colors ${
                  refreshState === 'success'
                    ? 'border-success text-success bg-success-bg'
                    : refreshState === 'loading'
                    ? 'border-border text-navy-muted cursor-wait'
                    : 'border-border text-navy-muted hover:text-navy hover:border-navy-muted'
                }`}
                title="Rafraichir les donnees">
                {refreshState === 'success' ? (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    <span>OK</span>
                  </>
                ) : (
                  <>
                    <svg className={`w-3.5 h-3.5 ${refreshState === 'loading' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>{refreshState === 'loading' ? 'Mise a jour...' : 'Rafraichir'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Comarket warning banner */}
        {!['budget','competition','shopping','assistant','assets'].includes(activeView) && includeComarket && (
          <div className="mt-2 bg-warning-bg border border-warning rounded-inner px-3 py-1.5 text-xs text-warning flex items-center gap-2">
            <span>&#9888;</span>
            <span><strong>Comarket inclus</strong> — Les chiffres incluent les campagnes co-financees par les partenaires.</span>
          </div>
        )}
      </div>
    </header>
  );
}
