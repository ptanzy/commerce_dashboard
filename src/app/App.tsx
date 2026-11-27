import { useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import type { Dispatch } from 'react';
import {
  ArrowUpRight, CircleAlert, Database, Globe2, Layers3, Moon, RefreshCcw, Sun, Truck,
} from 'lucide-react';
import { filterReducer } from './filterReducer';
import { useDashboardData } from './useDashboardData';
import { useTheme } from './theme';
import type { DashboardTheme } from './theme';
import type { DashboardDataset } from '../data/loader';
import { selectCohort, selectFocusedFlowCohort, computeMetrics } from '../domain/selectors';
import type { Filters, FilterAction } from '../domain/types';
import { DEFAULT_FILTERS } from '../domain/types';
import type { FilterOptions } from '../components/FilterPanel';
import { FiltersAndViews } from '../components/FiltersAndViews';
import { KpiSkeletons } from '../components/KpiCards';
import { DashboardSectionCustomizer } from '../components/DashboardSectionCustomizer';
import { HiddenFilterToast } from '../components/HiddenFilterToast';
import { DashboardSections } from './DashboardSections';
import { defaultDashboardDefinition, FULL_DASHBOARD_ID, DASHBOARD_STORAGE_KEY, DASHBOARD_STORAGE_MAX_CHARS, readDashboardDefinition } from '../domain/dashboardWorkspace';
import { readDashboardWorkspaceStorage, writeDashboardWorkspaceStorage } from './dashboardWorkspaceStorage';
import type { WorkspaceReadStatus } from './dashboardWorkspaceStorage';
import { createNamedDashboard, definitionById, removeNamedDashboard, renameNamedDashboard, saveNamedDashboard, uniqueDashboardName, workspaceDraft, workspaceDraftDirty } from '../domain/dashboardWorkspaceManagement';
import { DashboardWorkspaceControls } from '../components/DashboardWorkspaceControls';
import type { DashboardChartViews, DashboardSectionId } from '../domain/dashboardWorkspace';
import type {DashboardTableId,TablePageSize} from '../domain/dashboardTablePreferences';
import { moveDashboardSection, shiftDashboardSection } from '../domain/dashboardSectionOrdering';
import { CsvExportButton } from '../components/AdvancedExploration';
import { DiagnosticsPanel } from '../components/DiagnosticsPanel';
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

let dashboardIdSequence=0;
function freshDashboardId():string {
  dashboardIdSequence+=1;
  const uuid=globalThis.crypto?.randomUUID?.();
  return uuid?'dashboard-'+uuid.replace(/-/g,'').slice(0,26):`dashboard-${Date.now()}-${dashboardIdSequence}`;
}

/** Keep large-dataset analytics off the urgent checkbox/click render. Small fixtures remain
 * synchronous, while full-data selections coalesce into one analytical update. The timer is
 * canceled on every new input, so the last selection wins and never loses an action. */
export function useSettledFilters(filters: Filters, orderCount: number, delayMs = 120, resetKey = ''): [Filters, boolean] {
  const [settled, setSettled] = useState({filters,resetKey});
  const largeDataset = orderCount >= 10000;
  useEffect(() => {
    if (!largeDataset) return;
    if(settled.resetKey!==resetKey){setSettled({filters,resetKey});return;}
    const handle = window.setTimeout(() => setSettled({filters,resetKey}), delayMs);
    return () => window.clearTimeout(handle);
  }, [filters, largeDataset, delayMs, resetKey]);
  if (!largeDataset || settled.resetKey!==resetKey) return [filters, false];
  return [settled.filters, settled.filters !== filters];
}

export function DashboardContent({dataset}: {dataset: DashboardDataset}) {
  const [initialWorkspace] = useState(() => readDashboardWorkspaceStorage(window.localStorage));
  const [workspace,setWorkspace] = useState(initialWorkspace.workspace);
  const [storageStatus,setStorageStatus] = useState<WorkspaceReadStatus>(initialWorkspace.status);
  const initialDefinition=definitionById(initialWorkspace.workspace,initialWorkspace.workspace.activeDashboardId) ?? defaultDashboardDefinition();
  const [previewDefinition,setPreviewDefinition] = useState(() => workspaceDraft(initialDefinition,initialDefinition.analysis.filters));
  const [filters, baseDispatch] = useReducer(filterReducer,initialDefinition.analysis.filters,
    current => filterReducer(DEFAULT_FILTERS,{type:'restore_filters',filters:current}));
  const [workspaceError,setWorkspaceError] = useState<string|null>(initialWorkspace.status==='ready'||initialWorkspace.status==='empty'?null:
    'Saved dashboard storage could not be safely read. Existing data has not been overwritten.');
  const [remoteChanged,setRemoteChanged] = useState(false);
  const filterPanelVisible=previewDefinition.layout.filterPanelVisible;
  const committedDefinition=definitionById(workspace,workspace.activeDashboardId) ?? defaultDashboardDefinition();
  const draftDefinition=useMemo(()=>workspaceDraft(previewDefinition,filters),[previewDefinition,filters]);
  const workspaceDirty=workspaceDraftDirty(committedDefinition,draftDefinition);
  // A blocked/malformed storage record must not be silently replaced by an empty workspace.
  const storageBlocked=storageStatus!=='empty'&&storageStatus!=='ready';
  const persistWorkspace=useCallback((next:typeof workspace):boolean=>{
    if(storageBlocked||remoteChanged){setWorkspaceError('Saved dashboards are unavailable or changed in another tab. Resolve this before writing.');return false;}
    const result=writeDashboardWorkspaceStorage(window.localStorage,next);
    if(!result.ok){setWorkspaceError(result.reason==='oversize'?'Dashboard storage limit reached. Nothing was saved.':
      result.reason==='invalid'?'Invalid dashboard configuration. Nothing was saved.':'Browser storage is unavailable or full. Nothing was saved.');return false;}
    setWorkspace(next);setStorageStatus('ready');setWorkspaceError(null);return true;
  },[storageBlocked,remoteChanged]);
  const activateDashboard=useCallback((definition:typeof previewDefinition)=>{
    // Chart preferences are now controlled by the dashboard definition, not transient chart-local state.
    setPreviewDefinition(workspaceDraft(definition,definition.analysis.filters));
    baseDispatch({type:'restore_filters',filters:definition.analysis.filters});
    setHiddenFilterNotice(null);
  },[]);
  const saveWorkspace=useCallback(():boolean=>{
    if(workspace.activeDashboardId===FULL_DASHBOARD_ID){setWorkspaceError('The Full Dashboard is protected. Create or duplicate it to save your changes.');return false;}
    const result=saveNamedDashboard(workspace,draftDefinition,new Date().toISOString());
    if(!result.ok){setWorkspaceError('Dashboard changes could not be validated. Nothing was saved.');return false;}
    if(!persistWorkspace(result.workspace))return false;
    setPreviewDefinition(result.dashboard);
    return true;
  },[workspace,draftDefinition,persistWorkspace]);
  const discardWorkspace=useCallback(()=>activateDashboard(committedDefinition),[activateDashboard,committedDefinition]);
  const createWorkspace=useCallback((name:string,fromCurrent:boolean):boolean=>{
    if(workspaceDirty&&!fromCurrent){setWorkspaceError('Save or discard current changes before starting a blank dashboard.');return false;}
    const source=fromCurrent?draftDefinition:defaultDashboardDefinition();
    const id=freshDashboardId();
    const result=createNamedDashboard(workspace,source,name,id,new Date().toISOString());
    if(!result.ok){setWorkspaceError(`Unable to create dashboard (${result.reason}).`);return false;}
    if(!persistWorkspace(result.workspace))return false;
    activateDashboard(result.dashboard);return true;
  },[workspace,workspaceDirty,draftDefinition,persistWorkspace,activateDashboard]);
  const duplicateWorkspace=useCallback(():boolean=>{
    return createWorkspace(uniqueDashboardName(workspace,`${previewDefinition.name} copy`),true);
  },[workspace,previewDefinition.name,createWorkspace]);
  const renameWorkspace=useCallback((name:string):boolean=>{
    const result=renameNamedDashboard(workspace,workspace.activeDashboardId,name,new Date().toISOString());
    if(!result.ok){setWorkspaceError(`Unable to rename dashboard (${result.reason}).`);return false;}
    if(!persistWorkspace(result.workspace))return false;
    setPreviewDefinition(previous=>({...previous,name:result.dashboard.name}));return true;
  },[workspace,persistWorkspace]);
  const switchWorkspace=useCallback((targetId:string,choice?:'save'|'discard'):boolean=>{
    const target=definitionById(workspace,targetId);
    if(!target){setWorkspaceError('Requested dashboard was not found.');return false;}
    if(targetId===workspace.activeDashboardId)return true;
    if(workspaceDirty&&!choice){setWorkspaceError('Save or discard your changes before switching dashboards.');return false;}
    let next=workspace;
    if(workspaceDirty&&choice==='save'){
      const saved=saveNamedDashboard(workspace,draftDefinition,new Date().toISOString());
      if(!saved.ok){setWorkspaceError('Current dashboard cannot be saved in place. Use New or Duplicate.');return false;}
      next=saved.workspace;
    }
    next={...next,activeDashboardId:targetId};
    if(!persistWorkspace(next))return false;
    activateDashboard(definitionById(next,targetId) ?? target);return true;
  },[workspace,workspaceDirty,draftDefinition,persistWorkspace,activateDashboard]);
  const deleteWorkspace=useCallback(():boolean=>{
    const result=removeNamedDashboard(workspace,workspace.activeDashboardId);
    if(!result.ok){setWorkspaceError('The selected dashboard cannot be deleted.');return false;}
    if(!persistWorkspace(result.workspace))return false;
    activateDashboard(result.dashboard);return true;
  },[workspace,persistWorkspace,activateDashboard]);
  const exportWorkspace=useCallback(()=>{
    const current=workspaceDraft(draftDefinition,filters);
    if(current.id===FULL_DASHBOARD_ID)return;
    const safe=readDashboardDefinition(current);
    if(!safe){setWorkspaceError('Invalid dashboard configuration cannot be exported.');return;}
    const blob=new Blob([JSON.stringify(safe,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='commerce-dashboard-'+safe.id+'.json';
    document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),0);
  },[draftDefinition,filters]);
  const importWorkspace=useCallback(async(file:File)=>{
    if(workspaceDirty){setWorkspaceError('Save or discard your current dashboard changes before importing.');return;}
    if(file.size>DASHBOARD_STORAGE_MAX_CHARS*4){setWorkspaceError('Dashboard import is too large.');return;}
    try{
      const raw=await file.text();
      if(raw.length>DASHBOARD_STORAGE_MAX_CHARS){setWorkspaceError('Dashboard import exceeds the maximum size.');return;}
      const validated=readDashboardDefinition(JSON.parse(raw) as unknown);
      if(!validated){setWorkspaceError('Unsupported or malformed dashboard file. Nothing was imported.');return;}
      const id=freshDashboardId();
      const name=uniqueDashboardName(workspace,validated.name);
      const result=createNamedDashboard(workspace,validated,name,id,new Date().toISOString());
      if(!result.ok){setWorkspaceError(`Unable to import dashboard (${result.reason}).`);return;}
      if(persistWorkspace(result.workspace))activateDashboard(result.dashboard);
    }catch{setWorkspaceError('Unable to read dashboard JSON. No changes were made.');}
  },[workspace,workspaceDirty,persistWorkspace,activateDashboard]);
  const reloadWorkspace=useCallback(():boolean=>{
    if(workspaceDirty){setWorkspaceError('Discard or save your local edits before reloading another tab’s changes.');return false;}
    const result=readDashboardWorkspaceStorage(window.localStorage);
    if(result.status!=='ready'&&result.status!=='empty'){
      setWorkspaceError('Unable to reload saved dashboards; their existing storage was preserved.');return false;
    }
    setWorkspace(result.workspace);setStorageStatus(result.status);setRemoteChanged(false);setWorkspaceError(null);
    activateDashboard(definitionById(result.workspace,result.workspace.activeDashboardId) ?? defaultDashboardDefinition());return true;
  },[workspaceDirty,activateDashboard]);
  useEffect(()=>{
    const listener=(event:StorageEvent)=>{
      if(event.key===DASHBOARD_STORAGE_KEY||event.key===null)setRemoteChanged(true);
    };
    window.addEventListener('storage',listener);
    return()=>window.removeEventListener('storage',listener);
  },[]);
  const [hiddenFilterNotice,setHiddenFilterNotice] = useState<{key:number;message:string}|null>(null);
  const notifyHiddenActiveFilters=useCallback((message:string)=>{
    setHiddenFilterNotice(previous=>({key:(previous?.key??0)+1,message}));
  },[]);
  const dismissHiddenFilterNotice=useCallback(()=>setHiddenFilterNotice(null),[]);
  const togglePreviewSection=useCallback((id:DashboardSectionId,visible:boolean)=>{
    setPreviewDefinition(previous=>{
      const hidden=new Set(previous.layout.hiddenSections);
      if(visible) hidden.delete(id); else hidden.add(id);
      return {...previous,layout:{...previous.layout,hiddenSections:previous.layout.sectionOrder.filter(section=>hidden.has(section))}};
    });
    if (!visible) {
      const hasGeographic=filters.sellerStates.length>0 || filters.customerStates.length>0;
      const hasDate=filters.purchaseDateFrom!==null || filters.purchaseDateTo!==null;
      const notice=id==='shippingSankey'&&filters.focusedFlows.length>0?'Sankey hidden.':
        id==='geographicDistribution'&&hasGeographic?'Geographic distribution hidden.':
        id==='deliveryTrends'&&hasDate?'Delivery trends hidden.':
        id==='categoryLeaderboard'&&filters.categories.length>0?'Category analysis hidden.':null;
      if(notice)notifyHiddenActiveFilters(notice);
    }
  },[filters,notifyHiddenActiveFilters]);
  const shiftPreviewSection=useCallback((id:DashboardSectionId,direction:-1|1)=>{
    setPreviewDefinition(previous=>({...previous,layout:{...previous.layout,
      sectionOrder:shiftDashboardSection(previous.layout.sectionOrder,id,direction)}}));
  },[]);
  const dragPreviewSection=useCallback((moving:DashboardSectionId,target:DashboardSectionId)=>{
    setPreviewDefinition(previous=>({...previous,layout:{...previous.layout,
      sectionOrder:moveDashboardSection(previous.layout.sectionOrder,moving,previous.layout.sectionOrder.indexOf(target))}}));
  },[]);
  const updateChartView=useCallback(<K extends keyof DashboardChartViews,>(key:K,value:DashboardChartViews[K])=>{
    setPreviewDefinition(previous=>({...previous,analysis:{...previous.analysis,
      views:{...previous.analysis.views,[key]:value}}}));
  },[]);
  const updateTablePageSize=useCallback((table:DashboardTableId,size:TablePageSize)=>{
    setPreviewDefinition(previous=>({...previous,analysis:{...previous.analysis,
      tablePageSizes:{...previous.analysis.tablePageSizes,[table]:size}}}));
  },[]);
  const toggleFilterPanel=useCallback((visible:boolean)=>{
    setPreviewDefinition(previous=>({...previous,layout:{...previous.layout,filterPanelVisible:visible}}));
    if(!visible && (filters.sellerStates.length||filters.customerStates.length||filters.categories.length||
      filters.focusedFlows.length||filters.purchaseDateFrom!==null||filters.purchaseDateTo!==null))
      notifyHiddenActiveFilters('Filter controls hidden.');
  },[filters,notifyHiddenActiveFilters]);
  const resetPreviewSections=useCallback(()=>{
    setPreviewDefinition(previous=>({...previous,layout:{...previous.layout,hiddenSections:[],filterPanelVisible:true}}));
    setHiddenFilterNotice(null);
  },[]);
  // Log only discrete user-initiated actions, not React render/effect cycles or raw filter values.
  const dispatch=useCallback<Dispatch<FilterAction>>((action)=>{
    recordUserAction(filterActionCode(action),action.type.includes('flow')?'sankey':'dashboard');
    baseDispatch(action);
  },[baseDispatch]);
  const [analyticalFilters, updating] = useSettledFilters(filters, dataset.index.orders.length,120,workspace.activeDashboardId);
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
    <HiddenFilterToast notice={hiddenFilterNotice} onDismiss={dismissHiddenFilterNotice}/>
    <DashboardWorkspaceControls layoutEditor={<DashboardSectionCustomizer sectionOrder={previewDefinition.layout.sectionOrder} hiddenSections={previewDefinition.layout.hiddenSections}
      onToggle={togglePreviewSection} onReset={resetPreviewSections} onShift={shiftPreviewSection} onMove={dragPreviewSection}
      filterPanelVisible={filterPanelVisible} onToggleFilterPanel={toggleFilterPanel} />}
      visibleCount={previewDefinition.layout.sectionOrder.length-previewDefinition.layout.hiddenSections.length}
      dashboards={workspace.dashboards} activeId={workspace.activeDashboardId}
      dirty={workspaceDirty} error={workspaceError} remoteChanged={remoteChanged} storageBlocked={storageBlocked}
      onSwitch={switchWorkspace} onSave={saveWorkspace} onDiscard={discardWorkspace} onCreate={createWorkspace}
      onDuplicate={duplicateWorkspace} onRename={renameWorkspace} onDelete={deleteWorkspace}
      onImport={importWorkspace} onExport={exportWorkspace} onReload={reloadWorkspace}/>
    <FiltersAndViews filters={filters} dispatch={dispatch} options={options}
      matchedCount={metrics.distinctOrders} totalCount={dataset.index.orders.length} updating={updating}
      filterPanelVisible={filterPanelVisible} onShowFilterPanel={()=>toggleFilterPanel(true)} />
    {!updating && metrics.distinctOrders === 0 ? <div className="empty-banner" role="status"><CircleAlert size={19} aria-hidden="true" /><span><strong>No matching orders.</strong> The filters above produce an empty cohort. Clear one filter or reset all to explore the historical records.</span><button type="button" onClick={()=>dispatch({type:'clear_all'})}>Clear all filters <ArrowUpRight size={14}/></button></div> : null}
    <DashboardSections key={workspace.activeDashboardId} definition={previewDefinition} dataset={dataset} cohort={cohort} contextCohort={contextCohort}
      metrics={metrics} analyticalFilters={analyticalFilters} selectionFilters={filters} dispatch={dispatch} onChartViewChange={updateChartView}
      onTablePageSizeChange={updateTablePageSize}/>
    <CsvExportButton cohort={cohort}/>
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
