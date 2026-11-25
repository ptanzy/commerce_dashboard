import { useState, useSyncExternalStore } from 'react';
import { Activity, Camera, Download, PlayCircle, X } from 'lucide-react';
import {
  captureStateSnapshot, clearDiagnosticsEvents, exportDiagnosticsJson, getDiagnosticsSnapshot,
  recordEvent, recordUserAction, runDiagnosticsHealthChecks, subscribeDiagnostics,
} from '../observability/diagnostics';
import { RecoveryCenter } from './RecoveryCenter';
import { DeveloperIncidentPanel } from './DeveloperIncidentPanel';
import type { DiagnosticArea, Severity } from '../observability/diagnostics';

const HEALTH_NAMES = {dataset:'Dataset', geography:'Brazil map',browser_storage:'Browser storage'} as const;
const MEASUREMENT_NAMES = {
  dataset_load:'Load dataset', dataset_validation:'Validate records', geography_load:'Load geography',
  cohort_filter:'Apply global filters',flow_focus:'Apply flow focus', kpi_calculation:'Calculate KPIs',
  map_aggregation:'Aggregate map',trend_context:'Calculate timeline',trend_focus:'Calculate focused timeline',
  sankey_aggregation:'Aggregate flows',sankey_layout:'Lay out Sankey',
  explorer_rows:'Build order rows',explorer_sort:'Sort order rows',csv_export:'Prepare CSV',
} as const;
const CHECK_NAMES={dataset_validation:'Dataset validation',geography_integrity:'Brazil state topology',
  session_storage:'Session storage read/write',local_storage:'Saved-view storage read/write'} as const;
const STATE_NAMES={origins:'Selected seller origins',destinations:'Selected destinations',
  categories:'Selected categories',focusedFlows:'Focused Sankey pairs',
  eligibleOrders:'Eligible orders',dateFiltered:'Date filter active'} as const;
const ms = (n:number) => `${n.toFixed(1)} ms`;

function downloadDiagnostics(): boolean {
  let url: string | undefined;
  let scheduledCleanup = false;
  try {
    const blob = new Blob([exportDiagnosticsJson()],{type:'application/json;charset=utf-8'});
    url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'commerce-dashboard-diagnostics.json';
    document.body.appendChild(link);
    try { link.click(); } finally { link.remove(); }
    const resourceUrl = url;
    const revoke=URL.revokeObjectURL.bind(URL);
    window.setTimeout(() => revoke(resourceUrl), 1000);
    scheduledCleanup = true;
    return true;
  } catch {
    recordEvent('error','DIAGNOSTICS_EXPORT_FAILED','app');
    return false;
  } finally {
    if (url && !scheduledCleanup) URL.revokeObjectURL(url);
  }
}

/** WU-08: opt-in, local-only observability. No remote event collection or screenshot recording. */
export function DiagnosticsPanel() {
  const [open,setOpen] = useState(false);
  const [notice,setNotice] = useState('');
  const [level,setLevel] = useState<'all'|Severity>('all');
  const [area,setArea] = useState<'all'|DiagnosticArea>('all');
  const [codeQuery,setCodeQuery]=useState('');
  const diagnostics = useSyncExternalStore(subscribeDiagnostics,getDiagnosticsSnapshot,getDiagnosticsSnapshot);
  const errors = diagnostics.events.filter(event=>event.level==='error'||event.level==='fatal');
  const actions = diagnostics.events.filter(event=>event.kind==='action');
  const matching = diagnostics.events.filter(e=>(level==='all'||e.level===level)&&
    (area==='all'||e.area===area)&&e.code.toLowerCase().includes(codeQuery.trim().toLowerCase()));
  const state=diagnostics.currentState;
  return <div className="diagnostics-control">
    <button type="button" className="diagnostics-trigger" aria-expanded={open} aria-controls="application-diagnostics-panel" onClick={()=>{if(!open)recordUserAction('DIAGNOSTICS_OPENED','app');setOpen(v=>!v);}}>
      <Activity size={16} aria-hidden="true" /> Diagnostics{errors.length ? ` (${errors.length})` : ''}
    </button>
    {open ? <section id="application-diagnostics-panel" className="diagnostics-panel" role="region" aria-label="Application diagnostics">
      <div className="diagnostics-heading"><strong>Application diagnostics</strong><button type="button" aria-label="Close diagnostics" onClick={()=>setOpen(false)}><X size={17}/></button></div>
      <p className="diagnostics-disclaimer">Anonymous dashboard session. Only allowlisted event codes, measured timings and aggregate state counts are recorded locally. No user identity, raw records, order IDs, filter values, saved-view names, URLs, exception text or screenshots are captured. Export only when you choose to.</p>
      <div className="diagnostics-session" aria-label="Current dashboard session">
        <strong>Anonymous session</strong><span>{diagnostics.session.id}</span><span>Started {diagnostics.session.startedAt}</span>
        <span>{actions.length} recent actions · {errors.length} recent errors</span>
      </div>
      <RecoveryCenter diagnostics={diagnostics}/>
      <DeveloperIncidentPanel diagnostics={diagnostics}/>
      <h3>Build and environment</h3>
      <div className="diagnostics-facts" aria-label="Build information">
        <span>Version</span><strong>{diagnostics.build.version}</strong>
        <span>Commit</span><strong>{diagnostics.build.commit}</strong>
        <span>Built</span><strong>{diagnostics.build.builtAt}</strong>
        <span>Mode</span><strong>{diagnostics.build.mode}</strong>
        <span>Browser / OS</span><strong>{diagnostics.environment.browser} / {diagnostics.environment.os}</strong>
        <span>Data schema</span><strong>{diagnostics.datasetInfo.schemaVersion??'Unavailable'}</strong>
        <span>Processing version</span><strong>{diagnostics.datasetInfo.processingVersion}</strong>
        <span>Orders / items</span><strong>{diagnostics.datasetInfo.orderCount??'—'} / {diagnostics.datasetInfo.itemCount??'—'}</strong>
      </div>
      <h3>Component health</h3>
      <div className="diagnostics-health" aria-label="Component health">
        {(Object.keys(HEALTH_NAMES) as Array<keyof typeof HEALTH_NAMES>).map(key=><div key={key}><span>{HEALTH_NAMES[key]}</span><strong>{diagnostics.health[key]}</strong></div>)}
      </div>
      <div className="diagnostics-actions">
        <button type="button" onClick={()=>{const results=runDiagnosticsHealthChecks();setNotice(`Ran ${results.length} checks; ${results.filter(x=>x.status!=='pass').length} did not pass.`);}}><PlayCircle size={14}/> Run health checks</button>
      </div>
      {diagnostics.healthChecks.length ? <div className="diagnostics-table-wrap" aria-label="Health check results"><table><thead><tr><th>Check</th><th>Result</th><th>Details</th></tr></thead><tbody>
        {diagnostics.healthChecks.map(r=><tr key={r.code}><td>{CHECK_NAMES[r.code]}</td><td>{r.status.toUpperCase()}</td><td>{r.detail.replaceAll('_',' ')}</td></tr>)}
      </tbody></table><p className="diagnostics-muted">Checks validate current runtime status and storage availability; they do not reprocess all records.</p></div> : <p className="diagnostics-muted">Checks have not been run in this session.</p>}
      <h3>Sanitized dashboard state</h3>
      {state ? <div className="diagnostics-facts" aria-label="Current dashboard state">
        {(Object.keys(STATE_NAMES) as Array<keyof typeof STATE_NAMES>).flatMap(key=>[
          <span key={`${key}-name`}>{STATE_NAMES[key]}</span>,
          <strong key={`${key}-value`}>{typeof state[key]==='boolean'?(state[key]?'Yes':'No'):state[key]}</strong>,
        ])}
      </div> : <p className="diagnostics-muted">State counts will appear once the dashboard has loaded.</p>}
      <p className="diagnostics-muted">Chart modes: Map {diagnostics.views.mapMode}/{diagnostics.views.mapMeasure}; Trend {diagnostics.views.trendMeasure}; Sankey {diagnostics.views.sankeyMeasure}; Categories {diagnostics.views.categoryMeasure}.</p>
      <div className="diagnostics-actions"><button type="button" onClick={()=>setNotice(captureStateSnapshot()?'Sanitized state snapshot added to the event history.':'Dashboard state is not available yet.')}><Camera size={14}/> Capture state snapshot</button></div>
      <h3>Performance measurements</h3>
      {diagnostics.metrics.length ? <div className="diagnostics-table-wrap"><table><thead><tr><th>Operation</th><th>Latest</th><th>Avg</th><th>P95</th><th>Slow</th><th>N</th></tr></thead><tbody>
        {diagnostics.metrics.map(m=><tr key={m.name}><td>{MEASUREMENT_NAMES[m.name]}</td><td>{ms(m.lastMs)}</td><td>{ms(m.averageMs)}</td><td>{ms(m.p95Ms)}</td><td>{m.slowCount}</td><td>{m.count}</td></tr>)}
      </tbody></table></div> : <p>Measurements will appear after interacting with the dashboard.</p>}
      <p className="diagnostics-muted">P95 uses the rolling last 40 measurements. Slow thresholds are provisional engineering alerts, not UX acceptance guarantees.</p>
      <h3>Recent operation traces ({diagnostics.traces.length})</h3>
      <div className="diagnostics-events" aria-label="Recent operation traces">
        {diagnostics.traces.length ? <ol>{diagnostics.traces.slice(-20).reverse().map(t=><li key={t.id}>
          <span>#{t.id}</span><span>{MEASUREMENT_NAMES[t.operation]}</span><strong>{ms(t.elapsedMs)}</strong>
          {t.slow?<span>Slow</span>:null}<span>{t.relatedActionId?`Action #${t.relatedActionId} · ${t.relatedAction}`:'Background/initial operation'}</span>
        </li>)}</ol> : <p>No operation traces yet.</p>}
      </div>
      <h3>Session errors ({errors.length})</h3>
      <div className="diagnostics-events" aria-label="Session errors">
        {errors.length ? <ol>{errors.slice(-8).reverse().map((e,i)=><li key={`error-${e.timestamp}-${i}`}>
          <span>{e.timestamp.slice(11,19)}</span><strong>{e.level.toUpperCase()}</strong><span>{e.code}</span><span>{e.area}</span>
          <span>{e.relatedAction ? `After ${e.relatedAction} (#${e.relatedActionId})` : 'No recent user action'}</span>
          {e.state?<span>Snapshot: {e.state.eligibleOrders} orders · {e.state.focusedFlows} focused flows · {e.state.origins} origins</span>:null}
          {e.view?<span>Sankey measure at error: {e.view.sankeyMeasure}</span>:null}
        </li>)}</ol> : <p>No session errors recorded.</p>}
      </div>
      <h3>Session activity and system events ({diagnostics.events.length})</h3>
      <div className="diagnostics-filters" aria-label="Filter diagnostic events">
        <label>Severity<select aria-label="Filter log severity" value={level} onChange={e=>setLevel(e.target.value as 'all'|Severity)}>
          {['all','debug','info','warn','error','fatal'].map(v=><option key={v} value={v}>{v==='all'?'All levels':v.toUpperCase()}</option>)}
        </select></label>
        <label>Subsystem<select aria-label="Filter log subsystem" value={area} onChange={e=>setArea(e.target.value as 'all'|DiagnosticArea)}>
          {['all','app','dashboard','map','trends','sankey','orders','analytics'].map(v=><option key={v} value={v}>{v==='all'?'All areas':v}</option>)}
        </select></label>
        <label>Code<input aria-label="Filter log event code" value={codeQuery} onChange={e=>setCodeQuery(e.target.value)} placeholder="Find an event code" /></label>
      </div>
      <div className="diagnostics-events" aria-label="Recent diagnostic events">
        {matching.length ? <ol>{matching.slice(-25).reverse().map((e,i)=><li key={`${e.timestamp}-${i}`}>
          <span>{e.timestamp.slice(11,19)}</span><strong>{e.kind==='action'?'ACTION':e.level.toUpperCase()}</strong><span>{e.code}</span><span>{e.area}</span>
          {e.actionId?<span>#{e.actionId}</span>:null}{e.state?<span>State snapshot</span>:null}
        </li>)}</ol> : <p>{diagnostics.events.length?'No events match the current filters.':'No events recorded.'}</p>}
      </div>
      <div className="diagnostics-actions">
        <button type="button" onClick={()=>{recordUserAction('DIAGNOSTICS_EXPORT_REQUESTED','app');setNotice(downloadDiagnostics()?'Diagnostics file prepared locally.':'Unable to export diagnostics from this browser.');}}><Download size={14}/> Export diagnostics</button>
        <button type="button" onClick={()=>{clearDiagnosticsEvents();setNotice('Session event history cleared from memory and tab storage.');}}>Clear events</button>
      </div>
      {notice ? <p role="status" className="diagnostics-notice">{notice}</p>:null}
    </section>:null}
  </div>;
}
