import { useState, useEffect } from 'react';
import Header from './components/Header';
import KpiCards from './components/KpiCards';
import CostKpiChart from './components/CostKpiChart';
import GranularityTable from './components/GranularityTable';
import MarketTable from './components/MarketTable';
import BudgetPacing from './components/BudgetPacing';
import CampaignDrilldown from './components/CampaignDrilldown';
import ComarketView from './components/ComarketView';
import GA4View from './components/GA4View';
import ShoppingView from './components/ShoppingView';
import PaidSocialView from './components/PaidSocialView';
import FeedMonitorView from './components/FeedMonitorView';
import WeeklyPerformanceSummary from './components/WeeklyPerformanceSummary';
import AccordionSection from './components/AccordionSection';
import TopProgressBar from './components/TopProgressBar';
import LoginScreen from './components/LoginScreen';
import { useKpis, useMarkets, useDemoMode } from './hooks/useAdsData';
import { useAuth } from './contexts/AuthContext';
import { getPresetRange } from './utils/dateHelpers';

const STORAGE_KEY = 'sea_dashboard_filters';

function loadFilters() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    /* ignore */
  }
  const range = getPresetRange('last_week');
  return {
    brand: 'ALL',
    market: 'FR',
    preset: 'last_week',
    compareTo: 'previous_period',
    ...range,
  };
}

const PAID_SEARCH_SUBTABS = [
  { key: 'overview', label: "Vue d'ensemble" },
  { key: 'budget',   label: 'Budget' },
  { key: 'comarket', label: 'Comarket' },
  { key: 'shopping', label: 'Shopping' },
];

const PAID_SEARCH_SOURCES = [
  { key: 'ads', label: 'Google Ads' },
  { key: 'ga4', label: 'GA4' },
];

export default function App() {
  // TODO AUTH — décommenter pour activer le gate de connexion (nécessite users.json rempli côté backend)
  // const { isAuthenticated } = useAuth();
  // if (!isAuthenticated) {
  //   return <LoginScreen />;
  // }
  return <Dashboard />;
}

function Dashboard() {
  const [filters, setFilters] = useState(loadFilters);
  const [activeView, setActiveView] = useState('dashboard');
  const [paidSearchTab, setPaidSearchTab] = useState('overview');
  // Not persisted — always defaults to Google Ads on each session
  const [paidSearchSource, setPaidSearchSource] = useState('ads');
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const { data: modeData } = useDemoMode();
  const dataSource = modeData?.source;
  const kpis = useKpis({ ...filters, dataSource: paidSearchSource });
  const markets = useMarkets({ ...filters, dataSource: paidSearchSource });

  return (
    <div className="min-h-screen bg-bg-page flex flex-col">
      <TopProgressBar />
      <Header
        filters={filters}
        onFiltersChange={setFilters}
        activeView={activeView}
        onViewChange={setActiveView}
      />

      <main className="w-full max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {dataSource === 'sheets' && (
          <div className="bg-success-bg border border-success/20 rounded-card px-4 py-2.5 text-xs text-success font-medium flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-success" />
            <span>
              <strong>Google Sheets</strong> — Donnees importees depuis les rapports planifies
              Google Ads.
            </span>
          </div>
        )}

        {kpis.isError && (
          <div className="bg-danger-bg border border-danger/20 rounded-card px-4 py-3 text-xs text-danger font-medium">
            {kpis.error?.message?.includes('Not authenticated')
              ? 'Connectez votre compte Google Ads.'
              : `Erreur: ${kpis.error?.message || 'Echec du chargement'}`}
          </div>
        )}

        {kpis.isError && kpis.data && (
          <div className="bg-warning-bg border border-warning/20 rounded-card px-4 py-2 text-[11px] text-warning font-medium flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-warning" />
            Donnees en cache —{' '}
            {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}

        {activeView === 'dashboard' && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1 bg-white border border-border rounded-card shadow-sm p-1 w-fit">
                {PAID_SEARCH_SUBTABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setPaidSearchTab(t.key)}
                    className={`px-4 py-1.5 text-xs font-medium rounded-inner transition-colors ${
                      paidSearchTab === t.key
                        ? 'bg-navy text-white'
                        : 'text-navy-muted hover:text-navy hover:bg-bg-page'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {paidSearchTab === 'overview' && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-navy-muted uppercase tracking-wider font-medium">
                    Source data business
                  </span>
                  <div className="flex items-center gap-1 bg-white border border-border rounded-card shadow-sm p-1">
                    {PAID_SEARCH_SOURCES.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => setPaidSearchSource(s.key)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-inner transition-colors ${
                          paidSearchSource === s.key
                            ? 'bg-navy text-white'
                            : 'text-navy-muted hover:text-navy hover:bg-bg-page'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {paidSearchTab === 'overview' && (
              <>
                <AccordionSection
                  title="Bilan de la semaine dernière"
                  badge="Insights"
                  isOpenDefault={false}
                >
                  <WeeklyPerformanceSummary
                    brand={filters.brand}
                    market={filters.market}
                    dataSource={paidSearchSource}
                  />
                </AccordionSection>

                <KpiCards data={kpis.data} isLoading={kpis.isLoading} />
                <CostKpiChart filters={filters} dataSource={paidSearchSource} />
                <GranularityTable filters={filters} dataSource={paidSearchSource} />
                <MarketTable data={markets.data} isLoading={markets.isLoading} />

                <AccordionSection title="Détail des Campagnes Paid Search" badge="Détail">
                  <CampaignDrilldown filters={filters} dataSource={paidSearchSource} />
                </AccordionSection>
              </>
            )}

            {paidSearchTab === 'budget'   && <BudgetPacing filters={filters} />}
            {paidSearchTab === 'comarket' && <ComarketView filters={filters} />}
            {paidSearchTab === 'shopping' && <ShoppingView filters={filters} />}
          </>
        )}

        {activeView === 'analytics' && <GA4View filters={filters} />}

        {activeView === 'shopping' && <ShoppingView filters={filters} />}

        {activeView === 'paid-social' && <PaidSocialView filters={filters} />}

        {activeView === 'feed-monitor' && <FeedMonitorView filters={filters} />}
      </main>

      <footer className="mt-auto py-5 text-center border-t border-border">
        <span className="text-xs text-navy-muted tracking-widest uppercase select-none">
          Made with <span className="text-danger mx-0.5">♥</span> · Dhygietal
        </span>
      </footer>
    </div>
  );
}
