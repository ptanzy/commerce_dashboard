/** WU-08 recovery engine: bounded, local, allowlisted procedures—not arbitrary commands. */
import {
  getDiagnosticsSnapshot, recordEvent, recordRecoveryResult, runDiagnosticsHealthChecks,
  subscribeDiagnostics,
} from './diagnostics';
import type { DiagnosticArea, DiagnosticEvent, DiagnosticSnapshot, HealthName } from './diagnostics';

export type RecoveryTarget = 'dataset' | 'geography' | 'csv' | 'map' | 'trends' | 'sankey' | 'orders' | 'analytics';
export type RecoveryCommand = 'retry' | 'isolate' | 'restore' | 'check_storage';
export type RecoveryOutcome = 'verified' | 'failed' | 'isolated' | 'checked' | 'unavailable' | 'limit';
export type IssueKind = 'dataset' | 'geography' | 'render' | 'storage' | 'csv' | 'unexpected';
export interface RecoveryIssue {
  readonly key: string;
  readonly kind: IssueKind;
  readonly area: DiagnosticArea;
  readonly target: RecoveryTarget | null;
  readonly title: string;
  readonly explanation: string;
  readonly nextStep: string;
  readonly detectedAt: string;
}
export interface RecoveryAttempt {
  readonly timestamp: string;
  readonly kind: IssueKind;
  readonly area: DiagnosticArea;
  readonly action: RecoveryCommand;
  readonly outcome: RecoveryOutcome;
}
export interface RecoverySnapshot {
  readonly busy: string | null;
  readonly isolated: readonly DiagnosticArea[];
  readonly attempts: readonly RecoveryAttempt[];
}

type Handler = () => boolean | Promise<boolean>;
const handlers = new Map<string,Handler>();
const MAX_MANUAL_RETRIES = 2;
const MAX_HISTORY = 30;
const MAX_ISOLATABLE = new Set<DiagnosticArea>(['map','trends','sankey','orders','analytics']);
const attempts:RecoveryAttempt[]=[];
const isolated = new Set<DiagnosticArea>();
const listeners = new Set<()=>void>();
let busy: string|null = null;
let recoverySnapshot: RecoverySnapshot=Object.freeze({busy:null,isolated:Object.freeze([]),attempts:Object.freeze([])});
function publish():void {
  recoverySnapshot=Object.freeze({busy,isolated:Object.freeze([...isolated]),attempts:Object.freeze([...attempts])});
  for(const listener of listeners)listener();
}
export function getRecoverySnapshot():RecoverySnapshot {return recoverySnapshot;}
export function subscribeRecovery(listener:()=>void):()=>void {listeners.add(listener);return ()=>{listeners.delete(listener);};}
export function isSectionIsolated(area:DiagnosticArea):boolean {return isolated.has(area);}
export function registerRecoveryHandler(target:RecoveryTarget,command:Exclude<RecoveryCommand,'check_storage'>,handler:Handler):()=>void {
  const key=`${target}:${command}`;
  handlers.set(key,handler);
  return ()=>{if(handlers.get(key)===handler)handlers.delete(key);};
}

/** The recovery center never attempts to diagnose from free-text exceptions. */
const INCIDENTS: Readonly<Record<string,Omit<RecoveryIssue,'key'|'detectedAt'>>> = {
  'DATASET_LOAD_FAILED:app':{
    kind:'dataset',area:'app',target:'dataset',title:'Order data unavailable',
    explanation:'The local data could not be loaded or validated.',
    nextStep:'Retry once after checking the local development server. If files are missing or invalid, regenerate public/data using the documented Python preparation command.'},
  'GEOGRAPHY_LOAD_FAILED:map':{
    kind:'geography',area:'map',target:'geography',title:'Brazil map unavailable',
    explanation:'State geography could not be loaded or verified. Other analytical views remain usable.',
    nextStep:'Retry loading the map. If the topology file is missing or invalid, regenerate it with scripts/prepare_geo.py.'},
  'CSV_EXPORT_FAILED:analytics':{
    kind:'csv',area:'analytics',target:'csv',title:'CSV download failed',
    explanation:'The filtered-order export could not be prepared or downloaded.',
    nextStep:'Check download permissions and free browser memory before retrying. Large cohorts may need a smaller export.'},
  'STORAGE_READ_FAILED:app':{
    kind:'storage',area:'app',target:null,title:'Browser storage could not be read',
    explanation:'Saved preferences or views may be unavailable.',
    nextStep:'Run storage checks and review browser privacy or available storage. No saved views will be erased automatically.'},
  'STORAGE_WRITE_FAILED:app':{
    kind:'storage',area:'app',target:null,title:'Browser storage could not be written',
    explanation:'The browser may be blocking storage or may have reached its quota.',
    nextStep:'Run storage checks, then review private-browsing restrictions or storage quota. Saved views will not be erased automatically.'},
};
const RENDER_AREAS=new Set<DiagnosticArea>(['app','dashboard','map','trends','sankey','orders','analytics']);
function issueFrom(event:DiagnosticEvent):RecoveryIssue|null {
  if(event.code==='RENDER_FAILED' && RENDER_AREAS.has(event.area)) return {
    key:`RENDER_FAILED:${event.area}`,kind:'render',area:event.area,
    target:MAX_ISOLATABLE.has(event.area)?event.area as RecoveryTarget:null,
    title:event.area==='app'?'Dashboard failed to render':`${event.area} section failed to render`,
    explanation:'An unexpected UI rendering error occurred. The original exception was not stored.',
    nextStep:event.area==='app'?'Reload the dashboard; export diagnostics if it fails again.':
      'Retry the affected section. If it fails again, temporarily isolate it and continue using the other views.',
    detectedAt:event.timestamp,
  };
  const key=`${event.code}:${event.area}`;
  const def=INCIDENTS[key];
  if(def)return {key,...def,detectedAt:event.timestamp};
  if ((event.code==='UNHANDLED_ERROR'||event.code==='UNHANDLED_REJECTION')&&event.area==='app') return {
    key,kind:'unexpected',area:'app',target:null,title:'Unexpected application error',
    explanation:'An unhandled browser error was recorded.',
    nextStep:'Reload if the dashboard is unusable. Export a diagnostic report if the error recurs.',detectedAt:event.timestamp,
  };
  return null;
}
/** One latest active incident per known code+subsystem. Resolved incidents remain in logs. */
export function deriveRecoveryIssues(snapshot:Pick<DiagnosticSnapshot,'events'|'health'>):RecoveryIssue[] {
  const result=new Map<string,RecoveryIssue>();
  const success:Record<string,string>={DATASET_LOADED:'DATASET_LOAD_FAILED:app',GEOGRAPHY_LOADED:'GEOGRAPHY_LOAD_FAILED:map',CSV_EXPORTED:'CSV_EXPORT_FAILED:analytics'};
  const clearedAreas=new Set<string>();
  // Newest-first, with the latest success for a subsystem masking older matching failures.
  for(let i=snapshot.events.length-1;i>=0;i--){
    const event=snapshot.events[i];
    if(event.code==='RECOVERY_VERIFIED'){
      clearedAreas.add(`RENDER_FAILED:${event.area}`);
      continue;
    }
    const resolved=success[event.code];
    if(resolved){clearedAreas.add(resolved);continue;}
    const issue=issueFrom(event);
    if(issue&&!result.has(issue.key)&&!clearedAreas.has(issue.key)) result.set(issue.key,issue);
  }
  return [...result.values()].sort((a,b)=>b.detectedAt.localeCompare(a.detectedAt)).slice(0,8);
}

function allowed(issue:RecoveryIssue,command:RecoveryCommand):boolean {
  if(command==='check_storage')return issue.kind==='storage';
  if(command==='retry')return issue.kind==='dataset'||issue.kind==='geography'||issue.kind==='csv'||(issue.kind==='render'&&issue.target!==null);
  if(command==='isolate'||command==='restore')return issue.kind==='render'&&MAX_ISOLATABLE.has(issue.area);
  return false;
}
function recordAttempt(issue:RecoveryIssue,action:RecoveryCommand,outcome:RecoveryOutcome):void {
  const entry=Object.freeze({timestamp:new Date().toISOString(),kind:issue.kind,area:issue.area,action,outcome});
  attempts.push(entry);if(attempts.length>MAX_HISTORY)attempts.shift();
  recordRecoveryResult(entry);
  if(outcome==='verified'&&issue.kind==='render')recordEvent('info','RECOVERY_VERIFIED',issue.area);
  else if(outcome==='isolated')recordEvent('info','RECOVERY_ISOLATED',issue.area);
  else if(outcome==='failed')recordEvent('warn','RECOVERY_FAILED',issue.area);
  else if(outcome==='limit')recordEvent('warn','RECOVERY_LIMIT_REACHED',issue.area);
  publish();
}
export function isRecoveryAvailable(target:RecoveryTarget,action:RecoveryCommand):boolean {
  return action==='check_storage'||handlers.has(`${target}:${action}`);
}

/** Only the latest known issue and specifically allowlisted action are eligible. */
export async function runRecovery(issue:RecoveryIssue,action:RecoveryCommand):Promise<RecoveryOutcome> {
  if(busy)return 'unavailable';
  const active=deriveRecoveryIssues(getDiagnosticsSnapshot()).find(i=>i.key===issue.key&&i.detectedAt===issue.detectedAt);
  if(!active||!allowed(active,action))return 'unavailable';
  let latestVerified=-1;
  for(let i=attempts.length-1;i>=0;i--){
    const a=attempts[i];if(a.kind===issue.kind&&a.area===issue.area&&a.outcome==='verified'){latestVerified=i;break;}
  }
  const recentFailedRetries=attempts.slice(latestVerified+1).filter(a=>a.kind===issue.kind&&a.area===issue.area&&a.action==='retry'&&a.outcome==='failed').length;
  if(action==='retry'&&recentFailedRetries>=MAX_MANUAL_RETRIES){
    recordAttempt(active,action,'limit');return 'limit';
  }
  if(action==='check_storage'){
    // A probe is diagnostic evidence, not proof that a failing saved-view operation has been repaired.
    busy=`${issue.key}:${action}`;publish();
    try {runDiagnosticsHealthChecks();recordAttempt(active,action,'checked');return 'checked';}
    finally{busy=null;publish();}
  }
  const target=active.target;
  if(!target)return 'unavailable';
  if(action==='isolate'&&isolated.has(issue.area))return 'unavailable';
  if(action==='restore'&&!isolated.has(issue.area))return 'unavailable';
  const handler=handlers.get(`${target}:${action}`);
  if(!handler)return 'unavailable';
  busy=`${issue.key}:${action}`;publish();
  try {
    const ok=await handler();
    if(ok){
      if(action==='isolate')isolated.add(issue.area);
      if(action==='restore')isolated.delete(issue.area);
    }
    const outcome:RecoveryOutcome=ok?(action==='isolate'?'isolated':'verified'):'failed';
    recordAttempt(active,action,outcome);
    return outcome;
  }catch{
    // Never retain arbitrary thrown exception data in logs, reports or UI.
    recordAttempt(active,action,'failed');return 'failed';
  }finally{busy=null;publish();}
}

/** Correlates completion with a *new* pending->ready/degraded transition, not stale prior health. */
export function retryAndVerifyHealth(name:HealthName,trigger:()=>void,timeoutMs=12000):Promise<boolean> {
  return new Promise(resolve=>{
    let pendingSeen=false;let done=false;
    let timeout:ReturnType<typeof setTimeout>|undefined;
    let unsubscribe:()=>void=()=>{};
    const finish=(value:boolean)=>{if(done)return;done=true;unsubscribe();if(timeout!==undefined)clearTimeout(timeout);resolve(value);};
    const check=()=>{
      const current=getDiagnosticsSnapshot().health[name];
      if(current==='pending')pendingSeen=true;
      else if(pendingSeen&&(current==='ready'||current==='degraded'))finish(current==='ready');
    };
    unsubscribe=subscribeDiagnostics(check);
    timeout=setTimeout(()=>finish(false),timeoutMs);
    try {trigger();check();}catch{finish(false);}
  });
}

/** A single bounded retry for network/502/503/504 only; never retry bad JSON, 404, or invalid data. */
export async function fetchWithTransientRetry(
  url:string,signal:AbortSignal,fetcher:(url:string,init?:RequestInit)=>Promise<Response>,area:DiagnosticArea='app',delayMs=150,
):Promise<Response> {
  let tried=false;
  while(true){
    if(signal.aborted)throw new DOMException('Request aborted','AbortError');
    try {
      const response=await fetcher(url,{signal});
      if(response.ok||![502,503,504].includes(response.status)||tried)return response;
    }catch(error){
      if(signal.aborted||tried)throw error;
      // Network failures only; abort is never recoverable.
      if(error instanceof Error&&error.name==='AbortError')throw error;
      if(!(error instanceof TypeError))throw error;
    }
    tried=true;
    recordEvent('info','RECOVERY_AUTO_RETRY',area);
    await new Promise<void>((resolve,reject)=>{
      if(signal.aborted){reject(new DOMException('Request aborted','AbortError'));return;}
      let timer:ReturnType<typeof setTimeout>;
      const abort=()=>{clearTimeout(timer);reject(new DOMException('Request aborted','AbortError'));};
      timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},Math.max(0,delayMs));
      signal.addEventListener('abort',abort,{once:true});
    });
  }
}

/** Test isolation only. Existing dashboard state and browser storage are never reset by this. */
export function resetRecoveryForTests():void {
  attempts.length=0;isolated.clear();handlers.clear();busy=null;publish();
}
