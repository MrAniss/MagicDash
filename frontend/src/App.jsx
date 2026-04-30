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
import WeeklyPerformanceSummary from './components/WeeklyPerformanceSummary';
import AccordionSection from './components/AccordionSection';
import { useKpis, useMarkets, useDemoMode } from './hooks/useAdsData';
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
    market: 'ALL',
    preset: 'last_week',
    compareTo: 'previous_period',
    ...range,
  };
}

export default function App() {
  const [filters, setFilters] = useState(loadFilters);
  const [activeView, setActiveView] = useState('dashboard');
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  }, [filters]);

  const { data: modeData } = useDemoMode();
  const dataSource = modeData?.source;
  const kpis = useKpis(filters);
  const markets = useMarkets(filters);

  return (
    <div className="min-h-screen bg-bg-page flex flex-col">
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
            <AccordionSection
              title="Bilan de la semaine dernière"
              badge="Insights"
              isOpenDefault={false}
            >
              <WeeklyPerformanceSummary brand={filters.brand} market={filters.market} />
            </AccordionSection>

            <KpiCards data={kpis.data} isLoading={kpis.isLoading} />
            <CostKpiChart filters={filters} />
            <GranularityTable filters={filters} />
            <MarketTable data={markets.data} isLoading={markets.isLoading} />

            <AccordionSection title="Détail des Campagnes Paid Search" badge="Détail">
              <CampaignDrilldown filters={filters} />
            </AccordionSection>
          </>
        )}

        {activeView === 'analytics' && <GA4View filters={filters} />}

        {activeView === 'budget' && <BudgetPacing filters={filters} />}

        {activeView === 'comarket' && <ComarketView filters={filters} />}

        {activeView === 'shopping' && <ShoppingView filters={filters} />}
      </main>

      <footer className="mt-auto py-5 text-center border-t border-border">
        <span className="text-xs text-navy-muted tracking-widest uppercase select-none">
          Made with <span className="text-danger mx-0.5">♥</span> · Dhygietal
        </span>
      </footer>
    </div>
  );
}
