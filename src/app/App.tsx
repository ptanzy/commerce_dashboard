import { useCallback, useEffect, useMemo, useReducer, useState, memo } from 'react';
import type { Dispatch } from 'react';
import {
  ArrowDownRight, ArrowUpRight, BarChart3, CircleAlert, Database,
  GitBranch, Globe2, Layers3, MapPinned, Moon, RefreshCcw, Sun, Truck,
} from 'lucide-react';
import { filterReducer } from './filterReducer';
import { useDashboardData } from './useDashboardData';
import { useTheme } from './theme';
import type { DashboardTheme } from './theme';
import type { DashboardDataset } from '../data/loader';
import { selectCohort, selectFocusedFlowCohort, computeMetrics } from '../domain/selectors';
import type { Cohort } from '../domain/selectors';
import type { Filters, FilterAction } from '../domain/types';
import { DEFAULT_FILTERS } from '../domain/types';
import { FilterPanel } from '../components/FilterPanel';
import type { FilterOptions } from '../components/FilterPanel';
import { KpiCards, KpiSkeletons } from '../components/KpiCards';
import { BrazilMap } from '../charts/BrazilMap';
import { DeliveryTrends } from '../charts/DeliveryTrends';
import { ShippingSankey } from '../charts/ShippingSankey';
import { OrderExplorer } from '../features/orders/OrderExplorer';
import { SavedViews } from '../components/SavedViews';
import { CategoryLeaderboard, DelayDistributionChart, PeriodComparisonPanel, CsvExportButton } from '../components/AdvancedExploration';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
import { UiErrorBoundary } from '../observability/UiErrorBoundary';
import { registerRecoveryHandler, retryAndVerifyHealth } from '../observability/recovery';
import { clockNow, recordTiming, recordUserAction, setBuildInfo, setRuntimeEnvironment, updateDashboardState } from '../observability/diagnostics';
import type { UserActionCode } from '../observability/diagnostics';

function Header({theme, onToggle}: {theme: DashboardTheme;onToggle:()=>void}) {
  return <header className="topbar">
    <div className="shell topbar-inner">
      <a className="brand" href="#main" aria-label="Commerce Delivery Intelligence — main content">
        <span className="brand-icon"><Layers3 size={23} strokeWidth={2.3} aria-hidden="true" /></span>
        <span className="brand-wordmark"><strong>commerce<span className="brand-dot">.</span></strong><small>DELIVERY INTELLIGENCE</small></span>
      </a>
      <div className="topbar-actions">
        <DiagnosticsPanel/>
        <span className="edition-label"><span className="edition-dot" /> HISTORICAL DATA · OLIST</span>
        <span className="topbar-separator" aria-hidden="true" />
        <button type="button" className="theme-toggle" onClick={()=>{recordUserAction('THEME_CHANGED','app');onToggle();}} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={theme === 'light'}>
          {theme === 'dark' ? <Sun size={17} aria-hidden="true" /> : <Moon size={17} aria-hidden="true" />}
          <span className="hidden xs:inline">{theme === 'dark' ? 'Light mode' : 'Dark mode'}</span>
        </button>
      </div>
    </div>
  </header>;
}

function Intro({manifestInfo}: {manifestInfo: string}) {
  return <section className="hero" aria-labelledby="page-title">
    <div className="hero-copy">
      <div className="eyebrow"><span className="eyebrow-line" /> BRAZILIAN E-COMMERCE / 2016–2018</div>
      <h1 id="page-title">A clearer picture of<br /><span>every delivery.</span></h1>
      <p>Explore how orders move from sellers to customers—and what their delivery performance reveals. One connected view of historical Olist commerce.</p>
      <div className="hero-tags"><span><Database size={14} aria-hidden="true" /> {manifestInfo}</span><span><Globe2 size={14} aria-hidden="true" /> Brazil · 27 states</span><span><Truck size={14} aria-hidden="true" /> Order-to-doorstep metrics</span></div>
    </div>
    <div className="hero-decoration" aria-hidden="true"><span className="decoration-orbit orbit-one"/><span className="decoration-orbit orbit-two"/><span className="decoration-orbit orbit-three"/><span className="decoration-center"><Layers3 size={43} strokeWidth={1.3}/></span><span className="decoration-label">OLIST / HISTORICAL</span></div>
  </section>;
}

/** Options are derived from the unfiltered dataset and remain available even when an active filter empties the cohort. */
export function deriveFilterOptions(dataset: DashboardDataset): FilterOptions {
  const { index } = dataset;
  return {
    customers: [...new Set(index.orders.map(o=>o.customerState).filter((v):v is string=>Boolean(v)))].sort(),
    sellers: [...new Set(index.items.map(i=>i.sellerState).filter((v):v is string=>Boolean(v)))].sort(),
    categories: [...new Set(index.items.map(i=>i.category))].sort((a,b)=>a.localeCompare(b)),
    dateMin: index.fullHistoryMin,
    dateMax: index.fullHistoryMax,
  };
}

// Stable analytical props should not force unrelated expensive charts to render
// when a checkbox or flow receives its immediate UI update.
const MemoBrazilMap = memo(BrazilMap);
const MemoDeliveryTrends = memo(DeliveryTrends);
const MemoShippingSankey = memo(ShippingSankey);
const MemoKpiCards = memo(KpiCards);
const MemoPeriodComparison = memo(PeriodComparisonPanel);
const MemoCategoryLeaderboard = memo(CategoryLeaderboard);
const MemoDelayDistribution = memo(DelayDistributionChart);
const MemoOrderExplorer = memo(OrderExplorer);

function ChartsSection({dataset, cohort, filters, selectionFilters, dispatch}: {dataset: DashboardDataset; cohort: Cohort; filters: Filters; selectionFilters: Filters; dispatch: Dispatch<FilterAction>}) {
  return <section className="upcoming-section" aria-labelledby="patterns-heading">
    <div className="section-headline">
      <div><div className="section-eyebrow">02 / EXPLORE THE PATTERNS</div><h2 id="patterns-heading" className="content-heading">Beyond the numbers</h2></div>
      <div className="charts-heading-actions"><span className="workunit-label">Interactive geography · Monthly trends · State-to-state flows</span><a className="explore-orders-link" href="#order-explorer">View matching orders <ArrowDownRight size={15} aria-hidden="true" /></a></div>
    </div>
    <div className="chart-grid">
      <section className="viz-card" aria-labelledby="map-heading">
        <div className="viz-heading"><span className="future-icon"><MapPinned size={19} aria-hidden="true" /></span><div><h3 id="map-heading">Geographic distribution</h3><p>Seller origins & customer destinations</p></div></div>
        <UiErrorBoundary area="map"><MemoBrazilMap index={dataset.index} filters={filters} dispatch={dispatch}/></UiErrorBoundary>
      </section>
      <section className="viz-card" aria-labelledby="trend-heading">
        <div className="viz-heading"><span className="future-icon"><BarChart3 size={19} aria-hidden="true" /></span><div><h3 id="trend-heading">Delivery trends</h3><p>Historical order volume and punctuality</p></div></div>
        <UiErrorBoundary area="trends"><MemoDeliveryTrends index={dataset.index} filters={filters} dispatch={dispatch}/></UiErrorBoundary>
      </section>
    </div>
    <section className="viz-card viz-sankey" aria-labelledby="flow-heading">
      <div className="viz-heading"><span className="future-icon"><GitBranch size={19} aria-hidden="true" /></span><div><h3 id="flow-heading">Where orders originate—and where they go</h3><p>Top 15 seller-to-customer state relationships</p></div></div>
      <UiErrorBoundary area="sankey"><MemoShippingSankey cohort={cohort} filters={filters} selectionFilters={selectionFilters} dispatch={dispatch}/></UiErrorBoundary>
    </section>
  </section>;
}

function DataFootnote({ dataset }: {dataset: DashboardDataset}) {
  return <aside className="data-footnote" aria-label="About this dataset">
    <div className="footnote-icon"><Database size={21} aria-hidden="true" /></div>
    <div className="grow"><h2>Understand what you're measuring</h2><p>Orders are counted once, even when they contain multiple sellers or categories. Freight is the <strong>customer charge</strong> recorded on matching order items—not the carrier's actual cost. On-time means delivered on or before the promised calendar date.</p></div>
    <div className="footnote-source"><span>DATA SOURCE</span><strong>{dataset.manifest.sourceName}</strong><small>{dataset.manifest.sampleMode ? 'Synthetic/sample mode' : 'Historical sample · Local data'}</small></div>
  </aside>;
}

function filterActionCode(action:FilterAction):UserActionCode {
  switch(action.type) {
    case 'toggle_value':return action.dimension==='sellerStates'?'ORIGIN_SELECTION_CHANGED':
      action.dimension==='customerStates'?'DESTINATION_SELECTION_CHANGED':'CATEGORY_SELECTION_CHANGED';
    case 'clear_dimension':return 'FILTER_GROUP_CLEARED';
    case 'set_date_range':return 'DATE_RANGE_CHANGED';
    case 'focus_flow':return 'FLOW_FOCUSED';
    case 'toggle_flow_focus':return 'FLOW_SELECTION_CHANGED';
    case 'clear_flow_focus':return 'FLOW_FOCUS_CLEARED';
    case 'restore_filters':return 'SAVED_VIEW_RESTORED';
    case 'clear_all':return 'FILTERS_RESET';
  }
}

/** Keep large-dataset analytics off the urgent checkbox/click render. Small fixtures remain
 * synchronous, while full-data selections coalesce into one analytical update. The timer is
 * canceled on every new input, so the last selection wins and never loses an action. */
export function useSettledFilters(filters: Filters, orderCount: number, delayMs = 120): [Filters, boolean] {
  const [settled, setSettled] = useState(filters);
  const largeDataset = orderCount >= 10000;
  useEffect(() => {
    if (!largeDataset) return;
    const handle = window.setTimeout(() => setSettled(filters), delayMs);
    return () => window.clearTimeout(handle);
  }, [filters, largeDataset, delayMs]);
  if (!largeDataset) return [filters, false];
  return [settled, settled !== filters];
}

export function DashboardContent({dataset}: {dataset: DashboardDataset}) {
  const [filters, baseDispatch] = useReducer(filterReducer, { ...DEFAULT_FILTERS });
  // Log only discrete user-initiated actions, not React render/effect cycles or raw filter values.
  const dispatch=useCallback<Dispatch<FilterAction>>((action)=>{
    recordUserAction(filterActionCode(action),action.type.includes('flow')?'sankey':'dashboard');
    baseDispatch(action);
  },[baseDispatch]);
  const [analyticalFilters, updating] = useSettledFilters(filters, dataset.index.orders.length);
  // Measure pure computations without notifying diagnostics subscribers during React render.
  const globalResult = useMemo(() => {
    const start = clockNow();
    const value = selectCohort(dataset.index,analyticalFilters);
    return {value, ms:clockNow()-start};
  }, [dataset.index, analyticalFilters.purchaseDateFrom, analyticalFilters.purchaseDateTo, analyticalFilters.customerStates, analyticalFilters.sellerStates, analyticalFilters.categories]);
  const contextCohort = globalResult.value;
  const focusResult = useMemo(() => {
    const start = clockNow();
    const value = selectFocusedFlowCohort(contextCohort,analyticalFilters.focusedFlows);
    return {value, ms:clockNow()-start};
  }, [contextCohort,analyticalFilters.focusedFlows]);
  const cohort = focusResult.value;
  const metricResult = useMemo(() => {
    const start = clockNow();
    const value = computeMetrics(cohort);
    return {value, ms:clockNow()-start};
  }, [cohort]);
  const metrics = metricResult.value;
  useEffect(() => recordTiming('cohort_filter',globalResult.ms),[globalResult]);
  useEffect(() => recordTiming('flow_focus',focusResult.ms),[focusResult]);
  useEffect(() => recordTiming('kpi_calculation',metricResult.ms),[metricResult]);
  // Report only aggregate counts after React commits; no filter values or order identifiers.
  useEffect(() => updateDashboardState({origins:filters.sellerStates.length,
    destinations:filters.customerStates.length,categories:filters.categories.length,
    focusedFlows:filters.focusedFlows.length,
    dateFiltered:filters.purchaseDateFrom!==null||filters.purchaseDateTo!==null,
    eligibleOrders:metrics.distinctOrders}),[filters,metrics.distinctOrders]);
  const options = useMemo(() => deriveFilterOptions(dataset), [dataset]);

  return <>
    <FilterPanel filters={filters} dispatch={dispatch} options={options} matchedCount={metrics.distinctOrders} totalCount={dataset.index.orders.length} updating={updating} />
    <SavedViews filters={filters} dispatch={dispatch} />
    {!updating && metrics.distinctOrders === 0 ? <div className="empty-banner" role="status"><CircleAlert size={19} aria-hidden="true" /><span><strong>No matching orders.</strong> The filters above produce an empty cohort. Clear one filter or reset all to explore the historical records.</span><button type="button" onClick={()=>dispatch({type:'clear_all'})}>Clear all filters <ArrowUpRight size={14}/></button></div> : null}
    {filters.focusedFlows.length ? <div className="flow-focus-banner" role="status"><strong>{filters.focusedFlows.length} focused {filters.focusedFlows.length===1?'flow':'flows'}</strong><span>KPIs, trends, and order explorer include any selected directed pair, but count each matching order once. Sankey and map retain context.</span><button type="button" onClick={()=>dispatch({type:'clear_flow_focus'})}>Clear flow focus</button></div> : null}
    <MemoKpiCards metrics={metrics} cohort={cohort} />
    <UiErrorBoundary area="analytics"><MemoPeriodComparison index={dataset.index} filters={analyticalFilters} metrics={metrics} /></UiErrorBoundary>
    <ChartsSection dataset={dataset} cohort={contextCohort} filters={analyticalFilters} selectionFilters={filters} dispatch={dispatch} />
    <section className="upcoming-section advanced-section" aria-labelledby="advanced-heading">
      <div className="section-headline"><div><div className="section-eyebrow">03 / DEEPER DELIVERY INTELLIGENCE</div><h2 id="advanced-heading" className="content-heading">Explore the details</h2></div><span className="workunit-label">Category mix · Calendar-day delays</span></div>
      <div className="advanced-grid"><MemoCategoryLeaderboard cohort={cohort}/><MemoDelayDistribution cohort={cohort}/></div>
    </section>
    <CsvExportButton cohort={cohort}/>
    <UiErrorBoundary area="orders"><MemoOrderExplorer index={dataset.index} cohort={cohort} filters={analyticalFilters} /></UiErrorBoundary>
    <DataFootnote dataset={dataset} />
  </>;
}

function LoadingDashboard() {
  return <div role="status" aria-live="polite" className="loading-content">
    <div className="loading-banner"><RefreshCcw size={20} className="spin-slow" aria-hidden="true"/><div><strong>Preparing your dashboard…</strong><p>Loading local order records and validating the analytical data model. The first load may take a moment.</p></div></div>
    <KpiSkeletons />
  </div>;
}

function ErrorDashboard({message,retry}: {message:string;retry:()=>void}) {
  return <section className="error-panel" role="alert"><span className="error-icon"><CircleAlert size={28} aria-hidden="true" /></span>
    <h2>We couldn't open the local dataset.</h2><p>{message}</p>
    <div className="command-hint"><span>Generate the missing files from your repository root:</span><code>python scripts/prepare_data.py --input data/raw/olist.zip --output public/data</code></div>
    <button type="button" onClick={retry} className="primary-button"><RefreshCcw size={16} aria-hidden="true" /> Try loading again</button>
  </section>;
}

export function App() {
  const {theme, toggleTheme} = useTheme();
  const data = useDashboardData();
  useEffect(()=>registerRecoveryHandler('dataset','retry',()=>retryAndVerifyHealth('dataset',data.retry)),[data.retry]);
  useEffect(()=>{
    // Only broad platform families are retained; never log navigator.userAgent itself.
    const ua=typeof navigator==='undefined'?'':navigator.userAgent;
    const browser=/Edg\//.test(ua)?'Edge':/Firefox\//.test(ua)?'Firefox':
      /Chrome\//.test(ua)?'Chrome':/Safari\//.test(ua)?'Safari':'Other';
    const os=/Android/.test(ua)?'Android':/iPhone|iPad|iPod/.test(ua)?'iOS':
      /Windows/.test(ua)?'Windows':/Macintosh|Mac OS/.test(ua)?'macOS':/Linux/.test(ua)?'Linux':'Other';
    setRuntimeEnvironment({browser,os});
  },[]);
  useEffect(()=>setBuildInfo({
    version: import.meta.env.VITE_APP_VERSION || '0.6.0',
    commit: import.meta.env.VITE_APP_GIT_COMMIT || 'unavailable',
    builtAt: import.meta.env.VITE_APP_BUILD_TIME || 'unavailable',
    mode: ['development','production','test'].includes(import.meta.env.MODE)
      ? import.meta.env.MODE as 'development' | 'production' | 'test' : 'unknown',
  }),[]);
  const manifestInfo = data.status === 'ready'
    ? `${data.dataset.manifest.sampleMode ? 'SAMPLE' : 'VERIFIED'} · ${data.dataset.manifest.purchaseDateMin?.slice(0,4) ?? '–'}–${data.dataset.manifest.purchaseDateMax?.slice(0,4) ?? '–'}`
    : 'LOCAL OLIST DATA';
  return <div className="app-root">
    <a className="skip-link" href="#main">Skip to main content</a>
    <Header theme={theme} onToggle={toggleTheme} />
    <main id="main" className="shell main-content">
      <Intro manifestInfo={manifestInfo}/>
      {data.status === 'ready' ? <DashboardContent dataset={data.dataset}/> : data.status === 'loading' ? <LoadingDashboard/> : <ErrorDashboard message={data.error} retry={data.retry}/>}
    </main>
    <footer className="page-footer"><div className="shell footer-inner"><span className="flex items-center gap-2"><Layers3 size={17} aria-hidden="true" /> commerce<span className="brand-dot">.</span> <span className="footer-muted">/ Delivery Intelligence</span></span><div>Historical data © <a href="https://www.kaggle.com/datasets/olistbr/brazilian-ecommerce" target="_blank" rel="noreferrer">Olist via Kaggle <ArrowUpRight size={12} aria-hidden="true" /></a> · CC BY-NC-SA 4.0 · Local POC</div></div></footer>
  </div>;
}
