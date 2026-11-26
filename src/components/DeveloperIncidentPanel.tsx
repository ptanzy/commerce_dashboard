import { useEffect, useId, useState } from 'react';
import { ChevronDown, ChevronUp, ClipboardList, Download, SearchCheck } from 'lucide-react';
import {
  getDiagnosticsSnapshot, recordEvent, runDiagnosticsHealthChecks,
} from '../observability/diagnostics';
import type { DiagnosticSnapshot } from '../observability/diagnostics';
import {
  incidentReportBundle, incidentReportMarkdown, investigateIncident, listIncidentCases, nextIncidentConfirmationAt,
} from '../observability/investigation';
import type { DeveloperIncidentReport } from '../observability/investigation';

function downloadReport(content:string,name:string,mime:string):boolean {
  let url:string|undefined;
  let scheduled=false;
  try{
    url=URL.createObjectURL(new Blob([content],{type:mime}));
    const link=document.createElement('a');link.download=name;link.href=url;
    document.body.appendChild(link);
    try{link.click();}finally{link.remove();}
    const revoke=URL.revokeObjectURL.bind(URL),resource=url;
    window.setTimeout(()=>revoke(resource),1000);
    scheduled=true;
    return true;
  }catch{recordEvent('error','DIAGNOSTICS_EXPORT_FAILED','app');return false;}
  finally{if(url&&!scheduled)URL.revokeObjectURL(url);}
}

/** No remote AI requests. Creates a testable, evidence-limited developer handoff. */
export function DeveloperIncidentPanel({diagnostics}: {diagnostics:DiagnosticSnapshot}) {
  // Time advances without new diagnostics events; all lifecycle truth remains in the
  // bounded persisted event log, never in this timer or local component state.
  const [clock,setClock]=useState(()=>Date.now());
  const cases=listIncidentCases(diagnostics,Math.max(clock,Date.now()));
  const active=cases.filter(c=>c.status!=='recovered');
  const history=cases.filter(c=>c.status==='recovered');
  const [view,setView]=useState<'active'|'history'>('active');
  const [selected,setSelected]=useState('');
  const [report,setReport]=useState<DeveloperIncidentReport|null>(null);
  const [notice,setNotice]=useState('');
  // null = automatic (expanded with active work, compact otherwise).
  const [manualExpanded,setManualExpanded]=useState<boolean|null>(null);
  const [reportExpanded,setReportExpanded]=useState(true);
  const sectionBodyId=useId();
  const reportBodyId=useId();
  const displayed=view==='active'?active:history;
  const sectionExpanded=manualExpanded??(active.length>0);
  const chosen=displayed.some(c=>c.id===selected)?selected:(displayed[0]?.id??'');
  const visibleReport=report&&displayed.some(c=>c.id===report.incident.id)?report:null;
  const nextDeadline=nextIncidentConfirmationAt(cases);
  useEffect(()=>{
    if(nextDeadline===null)return;
    const refresh=()=>setClock(Date.now());
    const remaining=Math.max(0,nextDeadline-Date.now());
    const timer=window.setTimeout(refresh,remaining);
    document.addEventListener('visibilitychange',refresh);
    window.addEventListener('focus',refresh);
    return ()=>{window.clearTimeout(timer);document.removeEventListener('visibilitychange',refresh);
      window.removeEventListener('focus',refresh);};
  },[nextDeadline,diagnostics]);
  function switchView(next:'active'|'history'):void {
    setView(next);setSelected('');setReport(null);setNotice('');
    if(next==='history')setManualExpanded(true);
  }
  function investigate():void {
    if(!chosen)return;
    // Non-destructive, synchronous probes. Never reset saved views or selections.
    runDiagnosticsHealthChecks();
    const result=investigateIncident(getDiagnosticsSnapshot(),chosen);
    setReport(result);
    setReportExpanded(true);
    setNotice(result?'Hypotheses generated from available evidence. Root cause is not confirmed.':'The incident is no longer in the retained diagnostic history.');
  }
  function save(format:'markdown'|'json'):void {
    if(!visibleReport)return;
    const content=format==='markdown'?incidentReportMarkdown(visibleReport):
      incidentReportBundle(visibleReport,getDiagnosticsSnapshot());
    const ok=downloadReport(content,`commerce-developer-incident.${format==='markdown'?'md':'json'}`,
      format==='markdown'?'text/markdown;charset=utf-8':'application/json;charset=utf-8');
    setNotice(ok?'Local developer report download initiated. Review before sharing.':'Unable to prepare the local report download.');
  }
  return <section className="developer-investigation" aria-label="Developer incident investigation">
    <h3><button type="button" className="developer-investigation-toggle"
      aria-expanded={sectionExpanded} aria-controls={sectionBodyId}
      aria-label={`${sectionExpanded?'Collapse':'Expand'} developer incident investigation`}
      onClick={()=>setManualExpanded(!sectionExpanded)}>
      <ClipboardList size={16} aria-hidden="true"/>
      <span>Developer incident investigation</span>
      <span className="developer-investigation-count">{active.length} active {active.length===1?'incident':'incidents'}</span>
      {sectionExpanded?<ChevronUp size={16} aria-hidden="true"/>:<ChevronDown size={16} aria-hidden="true"/>}
    </button></h3>
    {history.length>0?<button type="button" className="developer-investigation-history-link"
      onClick={()=>switchView('history')} aria-label={`View recovered incident history (${history.length})`}>
      {history.length} recovered in history
    </button>:active.length===0?<span className="diagnostics-muted developer-investigation-empty">No active incidents</span>:null}
    <div id={sectionBodyId} className="developer-investigation-body" hidden={!sectionExpanded}>
    <p className="diagnostics-muted">For unresolved or unfamiliar errors. Groups recurring failures, gathers safe context, ranks possible causes and recommends tests to confirm or rule them out. Nothing is sent automatically.</p>
    <div className="developer-investigation-view" role="group" aria-label="Incident list view">
      <button type="button" aria-pressed={view==='active'} onClick={()=>switchView('active')}>Active ({active.length})</button>
      <button type="button" aria-pressed={view==='history'} onClick={()=>switchView('history')}>History ({history.length})</button>
    </div>
    {!displayed.length?<p className="diagnostics-muted">{view==='active'?'No active incidents.':'No recovered incidents in retained session history.'}</p>:<>
      <div className="developer-investigation-controls">
        <label htmlFor="developer-incident-select">Incident</label>
        <select id="developer-incident-select" aria-label="Choose incident to investigate" value={chosen}
          onChange={e=>{setSelected(e.target.value);setReport(null);setReportExpanded(true);setNotice('');}}>
          {displayed.map(c=><option value={c.id} key={c.id}>{c.area} · {c.code} ({c.occurrences})</option>)}
        </select>
        <button type="button" onClick={investigate}><SearchCheck size={15} aria-hidden="true"/> Investigate and check health</button>
      </div>
      {visibleReport?<article className="developer-incident-report" aria-label="Developer incident report">
        <div className="developer-incident-topline"><button type="button" className="developer-incident-report-toggle"
          aria-expanded={reportExpanded} aria-controls={reportBodyId}
          aria-label={`${reportExpanded?'Collapse':'Expand'} incident findings`}
          onClick={()=>setReportExpanded(expanded=>!expanded)}>
          <strong>{visibleReport.incident.title}</strong>
          <span>{visibleReport.incident.status.replaceAll('-',' ')}</span>
          {reportExpanded?<ChevronUp size={16} aria-hidden="true"/>:<ChevronDown size={16} aria-hidden="true"/>}
        </button></div>
        <div id={reportBodyId} className="developer-incident-findings" hidden={!reportExpanded}>
        <p className="diagnostics-muted">{visibleReport.incident.occurrences} occurrence(s) in retained history · Last seen {visibleReport.incident.lastSeen}
          {visibleReport.incident.recoveryObservedAt?` · Recovery observed ${visibleReport.incident.recoveryObservedAt}`:''}
          {visibleReport.incident.archivedAt?` · Recovery confirmed ${visibleReport.incident.archivedAt}`:''}</p>
        <p><strong>Root cause not confirmed.</strong> Evidence-based hypotheses only; rankings are investigative priorities, not probabilities.</p>
        {visibleReport.relatedAction?<p className="diagnostics-muted">Recent action: {visibleReport.relatedAction.code} (#{visibleReport.relatedAction.id}). Timing alone does not establish cause.</p>:null}
        <h4>Possible causes and how to investigate</h4>
        <ol className="developer-hypotheses">{visibleReport.possibleCauses.map(h=><li key={h.id}>
          <details><summary><strong>{h.title}</strong><span>{h.assessment.replaceAll('-',' ')}</span></summary>
            {h.supportingEvidence.length?<><p>Supporting observations</p><ul>{h.supportingEvidence.map(e=><li key={e}>{e}</li>)}</ul></>:<p>No distinctive supporting observation was captured.</p>}
            <p>Suggested troubleshooting</p><ol>{h.investigativeSteps.map(s=><li key={s}>{s}</li>)}</ol>
            <p><strong>Confirm:</strong> {h.confirmationCriterion}</p>
            <p><strong>Weaken:</strong> {h.disconfirmationCriterion}</p>
          </details>
        </li>)}</ol>
        <h4>Known limitations</h4>
        <p className="diagnostics-muted">Original exceptions and stack traces are not automatically retained. A developer may need a locally reviewed, redacted console trace to finish the investigation.</p>
        <div className="diagnostics-actions">
          <button type="button" onClick={()=>save('markdown')}><Download size={14}/> Export investigation (.md)</button>
          <button type="button" onClick={()=>save('json')}><Download size={14}/> Export developer bundle (.json)</button>
        </div>
        </div>
      </article>:null}
    </>}
    {notice?<p role="status" className="diagnostics-notice">{notice}</p>:null}
    </div>
  </section>;
}
