import { useMemo, useReducer } from 'react';
import {
  ArrowRight, ArrowUpRight, BarChart3, ChevronRight, CircleAlert, Database,
  GitBranch, Globe2, Layers3, MapPinned, Moon, RefreshCcw, Sun, Truck,
} from 'lucide-react';
import { filterReducer } from './filterReducer';
import { useDashboardData } from './useDashboardData';
import { useTheme } from './theme';
import type { DashboardTheme } from './theme';
import type { DashboardDataset } from '../data/loader';
import { selectCohort, computeMetrics } from '../domain/selectors';
import { DEFAULT_FILTERS } from '../domain/types';
import { FilterPanel } from '../components/FilterPanel';
import type { FilterOptions } from '../components/FilterPanel';
import { KpiCards, KpiSkeletons } from '../components/KpiCards';

function Header({theme, onToggle}: {theme: DashboardTheme;onToggle:()=>void}) {
  return <header className="topbar">
    <div className="shell topbar-inner">
      <a className="brand" href="#main" aria-label="Commerce Delivery Intelligence — main content">
        <span className="brand-icon"><Layers3 size={23} strokeWidth={2.3} aria-hidden="true" /></span>
        <span className="brand-wordmark"><strong>commerce<span className="brand-dot">.</span></strong><small>DELIVERY INTELLIGENCE</small></span>
      </a>
      <div className="topbar-actions">
        <span className="edition-label"><span className="edition-dot" /> HISTORICAL DATA · OLIST</span>
        <span className="topbar-separator" aria-hidden="true" />
        <button type="button" className="theme-toggle" onClick={onToggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} aria-pressed={theme === 'light'}>
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

function PlaceholderPanels() {
  return <section className="upcoming-section" aria-labelledby="upcoming-heading">
    <div className="section-headline">
      <div><div className="section-eyebrow">02 / EXPLORE THE PATTERNS</div><h2 id="upcoming-heading" className="content-heading">Beyond the numbers</h2></div>
      <span className="workunit-label">Visualizations · WU-03</span>
    </div>
    <div className="future-grid">
      <div className="future-card future-map">
        <div className="future-heading"><span className="future-icon"><MapPinned size={19}/></span><span><strong>Geographic distribution</strong><small>Seller origins & customer destinations</small></span><ChevronRight size={17} className="future-chevron" aria-hidden="true" /></div>
        <div className="future-body"><div className="placeholder-graphic"><Globe2 size={55} strokeWidth={1.1}/><span>27 Brazilian states</span></div><div className="future-overlay">Interactive state map · WU-03</div></div>
      </div>
      <div className="future-card future-trends">
        <div className="future-heading"><span className="future-icon"><BarChart3 size={19}/></span><span><strong>Delivery trends</strong><small>Monthly order volume & punctuality</small></span><ChevronRight size={17} className="future-chevron" aria-hidden="true" /></div>
        <div className="future-body"><div className="placeholder-graphic"><BarChart3 size={54} strokeWidth={1.1}/><span>Historical monthly trends</span></div><div className="future-overlay">Interactive timeline · WU-03</div></div>
      </div>
    </div>
    <div className="sankey-coming"><span className="future-icon"><GitBranch size={18}/></span><span className="grow"><strong>Seller → customer flows</strong><small>Sankey visualization of matching item contributions</small></span><span className="coming-label">COMING IN WU-03</span><ArrowRight size={17} aria-hidden="true" /></div>
  </section>;
}

function DataFootnote({ dataset }: {dataset: DashboardDataset}) {
  return <aside className="data-footnote" aria-label="About this dataset">
    <div className="footnote-icon"><Database size={21} aria-hidden="true" /></div>
    <div className="grow"><h2>Understand what you're measuring</h2><p>Orders are counted once, even when they contain multiple sellers or categories. Freight is the <strong>customer charge</strong> recorded on matching order items—not the carrier's actual cost. On-time means delivered on or before the promised calendar date.</p></div>
    <div className="footnote-source"><span>DATA SOURCE</span><strong>{dataset.manifest.sourceName}</strong><small>{dataset.manifest.sampleMode ? 'Synthetic/sample mode' : 'Historical sample · Local data'}</small></div>
  </aside>;
}

export function DashboardContent({dataset}: {dataset: DashboardDataset}) {
  const [filters, dispatch] = useReducer(filterReducer, { ...DEFAULT_FILTERS });
  const cohort = useMemo(() => selectCohort(dataset.index, filters), [dataset.index, filters]);
  const metrics = useMemo(() => computeMetrics(cohort), [cohort]);
  const options = useMemo(() => deriveFilterOptions(dataset), [dataset]);

  return <>
    <FilterPanel filters={filters} dispatch={dispatch} options={options} matchedCount={metrics.distinctOrders} totalCount={dataset.index.orders.length} />
    {metrics.distinctOrders === 0 ? <div className="empty-banner" role="status"><CircleAlert size={19} aria-hidden="true" /><span><strong>No matching orders.</strong> The filters above produce an empty cohort. Clear one filter or reset all to explore the historical records.</span><button type="button" onClick={()=>dispatch({type:'clear_all'})}>Clear all filters <ArrowUpRight size={14}/></button></div> : null}
    <KpiCards metrics={metrics} />
    <PlaceholderPanels />
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
