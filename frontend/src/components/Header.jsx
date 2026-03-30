import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthStatus } from '../hooks/useAdsData';
import { useComarket } from '../contexts/ComarketContext';
import { getPresetRange } from '../utils/dateHelpers';

const BRAND_TABS = [
  { key: 'ALL', label: 'All Brands' },
  { key: 'COCOONCENTER', label: 'Cocooncenter' },
  { key: 'PASCAL_COSTE', label: 'Pascal Coste' },
  { key: 'PARAPHARMACIE_LAFAYETTE', label: 'Para. Lafayette' },
];

const VIEW_TABS = [
  { key: 'dashboard',       label: 'Dashboard' },
  { key: 'analytics',       label: 'Analytics' },
  { key: 'budget',          label: 'Budget' },
  { key: 'campaigns',       label: 'Campagnes' },
  { key: 'comarket',        label: 'Comarket' },
  { key: 'competition',     label: 'Concurrence' },
  { key: 'recommendations', label: 'Recommandations' },
  { key: 'shopping',        label: 'Shopping' },
  { key: 'assistant',       label: 'Assistant' },
];

const PRESETS = [
  { key: 'last_week', label: 'Last Week' },
  { key: '7d', label: '7j' },
  { key: '30d', label: '30j' },
  { key: 'MTD', label: 'MTD' },
  { key: 'QTD', label: 'QTD' },
  { key: 'YTD', label: 'YTD' },
];

const COMPARE_OPTIONS = [
  { key: 'previous_period', label: 'Periode prec.' },
  { key: 'previous_year', label: 'N-1' },
];

export default function Header({ filters, onFiltersChange, activeView, onViewChange, recsBadge = 0 }) {
  const { data: authData } = useAuthStatus();
  const authenticated = authData?.authenticated;
  const { includeComarket, setIncludeComarket } = useComarket();
  const queryClient = useQueryClient();
  const [refreshState, setRefreshState] = useState('idle'); // idle | loading | success

  function handleBrand(brand) {
    onFiltersChange({ ...filters, brand });
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
      await fetch('/api/cache/clear', { method: 'POST' });
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
        <div className={`flex items-center justify-between ${!['budget','competition','recommendations','shopping','assistant'].includes(activeView) ? 'mb-3' : ''}`}>
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
                  {view.key === 'recommendations' && recsBadge > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center leading-none">
                      {recsBadge}
                    </span>
                  )}
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
        {!['budget','competition','recommendations','shopping','assistant'].includes(activeView) && (
          <div className="flex items-center justify-between gap-4 flex-wrap">
            {/* Brand tabs */}
            <div className="flex gap-1">
              {BRAND_TABS.map(tab => (
                <button key={tab.key} onClick={() => handleBrand(tab.key)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-inner transition-colors ${filters.brand === tab.key ? 'bg-navy text-white' : 'text-navy-muted hover:text-navy hover:bg-bg-page'}`}>
                  {tab.label}
                </button>
              ))}
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
        {!['budget','competition','recommendations','shopping','assistant'].includes(activeView) && includeComarket && (
          <div className="mt-2 bg-warning-bg border border-warning rounded-inner px-3 py-1.5 text-xs text-warning flex items-center gap-2">
            <span>&#9888;</span>
            <span><strong>Comarket inclus</strong> — Les chiffres incluent les campagnes co-financees par les partenaires.</span>
          </div>
        )}
      </div>
    </header>
  );
}
