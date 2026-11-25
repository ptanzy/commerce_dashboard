import { useState, useSyncExternalStore } from 'react';
import { AlertTriangle, CheckCircle2, RefreshCcw, ShieldAlert, Wrench } from 'lucide-react';
import type { DiagnosticSnapshot } from '../observability/diagnostics';
import {
  deriveRecoveryIssues, getRecoverySnapshot, isRecoveryAvailable, runRecovery, subscribeRecovery,
} from '../observability/recovery';
import type { RecoveryCommand, RecoveryIssue } from '../observability/recovery';

/** The center surfaces only known procedures. No free-form repair commands or AI execution. */
export function RecoveryCenter({diagnostics}: {diagnostics:DiagnosticSnapshot}) {
  const recovery=useSyncExternalStore(subscribeRecovery,getRecoverySnapshot,getRecoverySnapshot);
  const issues=deriveRecoveryIssues(diagnostics);
  const [notice,setNotice]=useState('');
  async function execute(issue:RecoveryIssue,action:RecoveryCommand) {
    setNotice('Recovery in progress; the result will be verified before it is reported.');
    const result=await runRecovery(issue,action);
    const messages={verified:'Recovery verified.',failed:'Recovery did not pass verification. See the recommended manual steps.',
      isolated:'Section isolated. Your dashboard filters and saved views were preserved.',
      checked:'Storage probes completed. Review their results below; this does not prove that saving will succeed.',
      unavailable:'The action is unavailable for this incident or the component has been unmounted.',
      limit:'Retry limit reached. Use the manual instructions or export a diagnostic report.'};
    setNotice(result==='verified'&&issue.kind==='csv'?'CSV download was initiated. Check your browser downloads to confirm delivery.':messages[result]);
  }
  return <section className="recovery-center" aria-label="Diagnostic recovery center">
    <h3><Wrench size={16} aria-hidden="true"/> Diagnostic Recovery Center</h3>
    <p className="diagnostics-muted">Known issues only. Temporary network failures receive at most one automatic request retry. Other repairs require your action. No files, filters, or saved views are deleted.</p>
    {!issues.length ? <p className="recovery-healthy"><CheckCircle2 size={16} aria-hidden="true"/> No unresolved known issues in the current log.</p> :
      <div className="recovery-issues">{issues.map(issue=>{
        const isIsolated=recovery.isolated.includes(issue.area)&&issue.kind==='render';
        const actions:RecoveryCommand[]=issue.kind==='storage'?['check_storage']:
          issue.target?(isIsolated?['restore']:issue.kind==='render'?['retry','isolate']:['retry']):[];
        return <article className="recovery-issue" key={issue.key}>
          <div className="recovery-issue-heading"><AlertTriangle size={16} aria-hidden="true"/>
            <strong>{issue.title}</strong><span>{isIsolated?'Isolated':'Needs attention'}</span></div>
          <p>{issue.explanation}</p><p className="diagnostics-muted">{issue.nextStep}</p>
          <div className="diagnostics-actions">
            {actions.filter(a=>a==='check_storage'||(issue.target&&isRecoveryAvailable(issue.target,a))).map(action=><button
              type="button" key={action} disabled={recovery.busy!==null} onClick={()=>void execute(issue,action)}>
              {action==='retry'?<RefreshCcw size={14}/>:action==='isolate'?<ShieldAlert size={14}/>:<Wrench size={14}/>}
              {action==='retry'?'Retry and verify':action==='isolate'?'Continue without section':action==='restore'?'Restore section':'Check browser storage'}
            </button>)}
          </div>
        </article>;
      })}</div>}
    {notice?<p className="diagnostics-notice" role="status">{notice}</p>:null}
    {recovery.attempts.length?<div className="recovery-history">
      <strong>Recent recovery attempts</strong>
      <ol>{recovery.attempts.slice(-6).reverse().map((attempt,i)=><li key={`${attempt.timestamp}-${i}`}>
        <span>{attempt.area} · {attempt.action.replaceAll('_',' ')}</span><strong>{attempt.outcome}</strong>
      </li>)}</ol>
    </div>:null}
    <p className="diagnostics-muted">A successful retry verifies the immediate operation, not the permanent cause. If failures recur, export diagnostics for a developer.</p>
  </section>;
}
