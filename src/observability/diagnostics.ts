/** WU-08: local, bounded diagnostics and anonymous session activity. No network telemetry. */
export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'fatal';
export type EventCode =
  | 'DATASET_LOAD_STARTED' | 'DATASET_LOADED' | 'DATASET_LOAD_FAILED' | 'DATASET_RETRY'
  | 'GEOGRAPHY_LOADED' | 'GEOGRAPHY_LOAD_FAILED'
  | 'CSV_EXPORTED' | 'CSV_EXPORT_FAILED' | 'STORAGE_WRITE_FAILED' | 'STORAGE_READ_FAILED'
  | 'RENDER_FAILED' | 'UNHANDLED_ERROR' | 'UNHANDLED_REJECTION'
  | 'DIAGNOSTICS_EXPORT_FAILED' | 'STATE_SNAPSHOT_CAPTURED' | 'HEALTH_CHECK_RAN' | 'OPERATION_SLOW'
  | 'RECOVERY_AUTO_RETRY' | 'RECOVERY_VERIFIED' | 'RECOVERY_ISOLATED' | 'RECOVERY_FAILED' | 'RECOVERY_LIMIT_REACHED';
export type UserActionCode =
  | 'ORIGIN_SELECTION_CHANGED' | 'DESTINATION_SELECTION_CHANGED' | 'CATEGORY_SELECTION_CHANGED'
  | 'FILTER_GROUP_CLEARED' | 'DATE_RANGE_CHANGED' | 'FILTERS_RESET'
  | 'FLOW_FOCUSED' | 'FLOW_SELECTION_CHANGED' | 'FLOW_FOCUS_CLEARED'
  | 'SAVED_VIEW_RESTORED' | 'SAVED_VIEW_CREATED' | 'SAVED_VIEW_RENAMED' | 'SAVED_VIEW_DELETED'
  | 'SAVED_VIEW_SAVE_REQUESTED' | 'SAVED_VIEW_RENAME_REQUESTED' | 'SAVED_VIEW_DELETE_REQUESTED'
  | 'MAP_VIEW_CHANGED' | 'MAP_MEASURE_CHANGED' | 'TREND_MEASURE_CHANGED'
  | 'SANKEY_MEASURE_CHANGED' | 'CATEGORY_MEASURE_CHANGED'
  | 'THEME_CHANGED' | 'CSV_EXPORT_REQUESTED' | 'DIAGNOSTICS_OPENED' | 'DIAGNOSTICS_EXPORT_REQUESTED'
  | 'ORDER_DETAILS_OPENED' | 'ORDER_SORT_CHANGED';
export type TimingName =
  | 'dataset_load' | 'dataset_validation' | 'geography_load'
  | 'cohort_filter' | 'flow_focus' | 'kpi_calculation' | 'map_aggregation'
  | 'trend_context' | 'trend_focus' | 'sankey_aggregation' | 'sankey_layout'
  | 'explorer_rows' | 'explorer_sort' | 'csv_export';
export type HealthName = 'dataset' | 'geography' | 'browser_storage';
export type HealthState = 'pending' | 'ready' | 'degraded';
export type DiagnosticArea = 'app' | 'dashboard' | 'map' | 'trends' | 'sankey' | 'orders' | 'analytics';
export interface SanitizedDashboardState {
  readonly origins: number;
  readonly destinations: number;
  readonly categories: number;
  readonly focusedFlows: number;
  readonly dateFiltered: boolean;
  readonly eligibleOrders: number;
}
export type DiagnosticView = 'mapMode' | 'mapMeasure' | 'trendMeasure' | 'sankeyMeasure' | 'categoryMeasure';
export interface DiagnosticBuild {
  readonly version: string;
  readonly commit: string;
  readonly builtAt: string;
  readonly mode: 'development' | 'production' | 'test' | 'unknown';
}
export type BrowserFamily = 'Edge' | 'Chrome' | 'Firefox' | 'Safari' | 'Other';
export type OsFamily = 'Windows' | 'macOS' | 'Linux' | 'Android' | 'iOS' | 'Other';
export interface DiagnosticEnvironment { readonly browser:BrowserFamily; readonly os:OsFamily; }
export interface DiagnosticDatasetInfo {
  readonly schemaVersion: number | null;
  readonly processingVersion: string;
  readonly orderCount: number | null;
  readonly itemCount: number | null;
}
export type HealthCheckCode = 'dataset_validation' | 'geography_integrity' | 'session_storage' | 'local_storage';
export type HealthCheckStatus = 'pass' | 'warning' | 'fail' | 'unsupported';
export interface HealthCheckResult {
  readonly code: HealthCheckCode;
  readonly status: HealthCheckStatus;
  /** Fixed, allowlisted explanation: no browser exceptions or stored content. */
  readonly detail: 'validated' | 'pending' | 'degraded' | 'available' | 'blocked' | 'no_browser';
}
export interface OperationTrace {
  readonly id: number;
  readonly timestamp: string;
  readonly operation: TimingName;
  readonly elapsedMs: number;
  readonly slow: boolean;
  readonly relatedAction?: UserActionCode;
  readonly relatedActionId?: number;
}
export interface DiagnosticEvent {
  readonly timestamp: string;
  readonly level: Severity;
  readonly code: EventCode | UserActionCode;
  readonly area: DiagnosticArea;
  readonly count?: number;
  readonly kind?: 'action';
  /** Monotone sequence across user actions within this anonymous tab session. */
  readonly actionId?: number;
  /** Only added to errors occurring within 30 seconds of a user action. */
  readonly relatedAction?: UserActionCode;
  readonly relatedActionId?: number;
  /** Whitelisted counts at failure time, not user data or record identifiers. */
  readonly state?: SanitizedDashboardState;
  readonly view?: Readonly<Record<DiagnosticView,string>>;
}
export interface SessionInfo {
  readonly id: string;
  readonly startedAt: string;
  readonly anonymous: true;
}
export interface MetricSummary {
  readonly name: TimingName;
  readonly count: number;
  readonly lastMs: number;
  readonly averageMs: number;
  readonly maxMs: number;
  readonly p95Ms: number;
  readonly slowCount: number;
}
export interface RecoveryDiagnosticRecord {
  readonly timestamp: string;
  readonly kind: 'dataset' | 'geography' | 'render' | 'storage' | 'csv' | 'unexpected';
  readonly area: DiagnosticArea;
  readonly action: 'retry' | 'isolate' | 'restore' | 'check_storage';
  readonly outcome: 'verified' | 'failed' | 'isolated' | 'checked' | 'unavailable' | 'limit';
}
export interface DiagnosticSnapshot {
  readonly session: SessionInfo;
  readonly events: readonly DiagnosticEvent[];
  readonly metrics: readonly MetricSummary[];
  readonly health: Readonly<Record<HealthName, HealthState>>;
  readonly build: DiagnosticBuild;
  readonly environment: DiagnosticEnvironment;
  readonly datasetInfo: DiagnosticDatasetInfo;
  readonly currentState: SanitizedDashboardState | null;
  readonly views: Readonly<Record<DiagnosticView, string>>;
  readonly traces: readonly OperationTrace[];
  readonly healthChecks: readonly HealthCheckResult[];
  readonly healthCheckedAt: string | null;
  readonly recoveryAttempts: readonly RecoveryDiagnosticRecord[];
}
const ALLOWED_CODES = new Set<EventCode>([
  'DATASET_LOAD_STARTED','DATASET_LOADED','DATASET_LOAD_FAILED','DATASET_RETRY',
  'GEOGRAPHY_LOADED','GEOGRAPHY_LOAD_FAILED','CSV_EXPORTED','CSV_EXPORT_FAILED',
  'STORAGE_WRITE_FAILED','STORAGE_READ_FAILED','RENDER_FAILED','UNHANDLED_ERROR',
  'UNHANDLED_REJECTION','DIAGNOSTICS_EXPORT_FAILED','STATE_SNAPSHOT_CAPTURED','HEALTH_CHECK_RAN','OPERATION_SLOW',
  'RECOVERY_AUTO_RETRY','RECOVERY_VERIFIED','RECOVERY_ISOLATED','RECOVERY_FAILED','RECOVERY_LIMIT_REACHED',
]);
const ALLOWED_ACTIONS = new Set<UserActionCode>([
  'ORIGIN_SELECTION_CHANGED','DESTINATION_SELECTION_CHANGED','CATEGORY_SELECTION_CHANGED',
  'FILTER_GROUP_CLEARED','DATE_RANGE_CHANGED','FILTERS_RESET',
  'FLOW_FOCUSED','FLOW_SELECTION_CHANGED','FLOW_FOCUS_CLEARED',
  'SAVED_VIEW_RESTORED','SAVED_VIEW_CREATED','SAVED_VIEW_RENAMED','SAVED_VIEW_DELETED',
  'SAVED_VIEW_SAVE_REQUESTED','SAVED_VIEW_RENAME_REQUESTED','SAVED_VIEW_DELETE_REQUESTED',
  'MAP_VIEW_CHANGED','MAP_MEASURE_CHANGED','TREND_MEASURE_CHANGED',
  'SANKEY_MEASURE_CHANGED','CATEGORY_MEASURE_CHANGED','THEME_CHANGED',
  'CSV_EXPORT_REQUESTED','DIAGNOSTICS_OPENED','DIAGNOSTICS_EXPORT_REQUESTED','ORDER_DETAILS_OPENED','ORDER_SORT_CHANGED',
]);
const ALLOWED_AREAS = new Set<DiagnosticArea>(['app','dashboard','map','trends','sankey','orders','analytics']);
const ALLOWED_LEVELS = new Set<Severity>(['debug','info','warn','error','fatal']);
const ALLOWED_TIMINGS = new Set<TimingName>([
  'dataset_load','dataset_validation','geography_load','cohort_filter','flow_focus',
  'kpi_calculation','map_aggregation','trend_context','trend_focus',
  'sankey_aggregation','sankey_layout','explorer_rows','explorer_sort','csv_export',
]);
const SESSION_KEY = 'commerce-dashboard-anonymous-diagnostics-v1';
const EVENT_LIMIT = 200;
const SAMPLE_LIMIT = 40;
const TRACE_LIMIT = 80;
const OPERATION_THRESHOLDS_MS: Readonly<Record<TimingName,number>> = Object.freeze({
  dataset_load:5000, dataset_validation:1500, geography_load:3000,
  cohort_filter:500, flow_focus:500, kpi_calculation:500, map_aggregation:500,
  trend_context:500, trend_focus:500, sankey_aggregation:500, sankey_layout:500,
  explorer_rows:500, explorer_sort:500, csv_export:5000,
});
const VIEW_OPTIONS: Readonly<Record<DiagnosticView,readonly string[]>> = Object.freeze({
  mapMode:['origin','destination'],mapMeasure:['orders','onTime','median'],
  trendMeasure:['orders','onTime'],sankeyMeasure:['items','freight','value'],
  categoryMeasure:['orders','value','freight','onTime'],
});
const VIEW_NAMES = Object.keys(VIEW_OPTIONS) as DiagnosticView[];
const INITIAL_VIEWS: Record<DiagnosticView,string>={mapMode:'origin',mapMeasure:'orders',trendMeasure:'orders',sankeyMeasure:'items',categoryMeasure:'orders'};
const buildFallback: DiagnosticBuild=Object.freeze({version:'0.6.0',commit:'unavailable',builtAt:'unavailable',mode:'unknown'});
/** Restore only known chart modes; injected strings are discarded. */
function sanitizeViews(value:unknown):Readonly<Record<DiagnosticView,string>>|null {
  if(!value||typeof value!=='object'||Array.isArray(value))return null;
  const raw=value as Record<string,unknown>;
  if(!VIEW_NAMES.every(name=>typeof raw[name]==='string'&&VIEW_OPTIONS[name].includes(raw[name] as string)))return null;
  return Object.freeze(Object.fromEntries(VIEW_NAMES.map(name=>[name,raw[name]])) as Record<DiagnosticView,string>);
}
function finiteCount(value:unknown):value is number {return Number.isSafeInteger(value) && typeof value==='number' && value>=0;}
/** Strict allowlist prevents runtime callers and modified storage injecting free-text into reports. */
function sanitizeDashboardState(raw:unknown):SanitizedDashboardState|null {
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const r=raw as Record<string,unknown>;
  if(!finiteCount(r.origins)||!finiteCount(r.destinations)||!finiteCount(r.categories)||
    !finiteCount(r.focusedFlows)||!finiteCount(r.eligibleOrders)||typeof r.dateFiltered!=='boolean')return null;
  return Object.freeze({origins:r.origins,destinations:r.destinations,categories:r.categories,
    focusedFlows:r.focusedFlows,dateFiltered:r.dateFiltered,eligibleOrders:r.eligibleOrders});
}
const RELATED_ACTION_MAX_AGE_MS = 30_000;
const isoDate = (value: unknown): value is string => typeof value === 'string' &&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));

/** A correlation label, not a user ID or authentication/session token. */
function newSession(): SessionInfo {
  const bytes = new Uint8Array(8);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else for (let i=0;i<bytes.length;i++) bytes[i] = Math.floor(Math.random()*256);
  return Object.freeze({id:'s-'+Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join(''),
    startedAt:new Date().toISOString(),anonymous:true as const});
}

/** Restore only explicitly allowlisted primitives; discard arbitrary injected browser-storage keys. */
function sanitizedStoredEvent(value: unknown): DiagnosticEvent | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string,unknown>;
  if (!isoDate(row.timestamp) || !ALLOWED_AREAS.has(row.area as DiagnosticArea) ||
      !ALLOWED_LEVELS.has(row.level as Severity)) return null;
  if (row.kind === 'action') {
    if (!ALLOWED_ACTIONS.has(row.code as UserActionCode) || row.level !== 'info' ||
      !Number.isSafeInteger(row.actionId) || (row.actionId as number) < 1) return null;
    return Object.freeze({timestamp:row.timestamp,level:'info',code:row.code as UserActionCode,
      area:row.area as DiagnosticArea,kind:'action',actionId:row.actionId as number});
  }
  if (row.kind !== undefined || !ALLOWED_CODES.has(row.code as EventCode)) return null;
  const hasCount=typeof row.count==='number'&&Number.isSafeInteger(row.count)&&row.count>=0;
  const state = sanitizeDashboardState(row.state);
  const view = sanitizeViews(row.view);
  const correlated=(row.level==='error'||row.level==='fatal') &&
    ALLOWED_ACTIONS.has(row.relatedAction as UserActionCode) &&
    Number.isSafeInteger(row.relatedActionId) && (row.relatedActionId as number)>0;
  return Object.freeze({timestamp:row.timestamp,level:row.level as Severity,
    code:row.code as EventCode,area:row.area as DiagnosticArea,
    ...(hasCount?{count:row.count as number}:{}),
    ...(state?{state}:{}),
    ...(view?{view}:{}),
    ...(correlated?{relatedAction:row.relatedAction as UserActionCode,relatedActionId:row.relatedActionId as number}:{})});
}

function restoreSession(): {session:SessionInfo; events:DiagnosticEvent[]} {
  if (typeof window === 'undefined') return {session:newSession(),events:[]};
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw || raw.length>100_000) return {session:newSession(),events:[]};
    const saved: unknown = JSON.parse(raw);
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {session:newSession(),events:[]};
    const record = saved as Record<string,unknown>;
    const ss = record.session;
    if (!ss || typeof ss !== 'object' || Array.isArray(ss)) return {session:newSession(),events:[]};
    const session = ss as Record<string,unknown>;
    if (typeof session.id !== 'string' || !/^s-[a-f0-9]{16}$/.test(session.id) ||
      !isoDate(session.startedAt) || session.anonymous !== true) return {session:newSession(),events:[]};
    const entries = Array.isArray(record.events) ? record.events.slice(-EVENT_LIMIT).map(sanitizedStoredEvent).filter((e):e is DiagnosticEvent=>e!==null) : [];
    return {session:Object.freeze({id:session.id,startedAt:session.startedAt,anonymous:true}),events:entries};
  } catch {return {session:newSession(),events:[]};}
}

const loaded=restoreSession();
let session: SessionInfo = loaded.session;
const events: DiagnosticEvent[] = loaded.events;
let actionSequence = Math.max(0,...events.map(e=>e.actionId??0));
let mostRecentAction: {code:UserActionCode;id:number;at:number} | null = null;
const last = [...events].reverse().find(e=>e.kind==='action');
if (last && last.kind==='action' && last.actionId) {
  const at=Date.parse(last.timestamp);
  if (Date.now()-at>=0 && Date.now()-at<=RELATED_ACTION_MAX_AGE_MS)
    mostRecentAction = {code:last.code as UserActionCode,id:last.actionId,at};
}
const samples = new Map<TimingName,number[]>();
const traces: OperationTrace[]=[];
const recoveryAttempts: RecoveryDiagnosticRecord[]=[];
let traceSequence=0;
let currentState:SanitizedDashboardState|null=null;
let build:DiagnosticBuild=buildFallback;
let environment:DiagnosticEnvironment=Object.freeze({browser:'Other',os:'Other'});
let datasetInfo:DiagnosticDatasetInfo=Object.freeze({schemaVersion:null,processingVersion:'unavailable',orderCount:null,itemCount:null});
const views: Record<DiagnosticView,string>={...INITIAL_VIEWS};
let healthChecks:HealthCheckResult[]=[];
let healthCheckedAt:string|null=null;
const health: Record<HealthName,HealthState> = {dataset:'pending',geography:'pending',browser_storage:'pending'};
const listeners = new Set<()=>void>();
let snapshot: DiagnosticSnapshot = Object.freeze({
  session,events:Object.freeze([...events]),metrics:Object.freeze([]),health:Object.freeze({...health}),
  build,environment,datasetInfo,currentState,views:Object.freeze({...views}),traces:Object.freeze([]),
  healthChecks:Object.freeze([]),healthCheckedAt,recoveryAttempts:Object.freeze([]),
});

function persistSession(): void {
  if (typeof window === 'undefined') return;
  try {window.sessionStorage.setItem(SESSION_KEY,JSON.stringify({session,events}));}
  catch { /* Disabled or full session storage must never interrupt the app or recurse into logging. */ }
}
function pushEvent(entry: DiagnosticEvent): void {
  events.push(Object.freeze(entry));
  if (events.length>EVENT_LIMIT) events.splice(0,events.length-EVENT_LIMIT);
  persistSession();
  publish();
}

/** Only fixed codes, fixed areas, and finite counts; never raw exception text or user-entered values. */
export function recordEvent(level:Severity,code:EventCode,area:DiagnosticArea='app',count?:number): void {
  if (!ALLOWED_LEVELS.has(level)||!ALLOWED_CODES.has(code)||!ALLOWED_AREAS.has(area)) return;
  const now=Date.now();
  const lastAction = mostRecentAction;
  const correlated=(level==='error'||level==='fatal') && lastAction!==null && now-lastAction.at>=0 && now-lastAction.at<=RELATED_ACTION_MAX_AGE_MS;
  pushEvent({timestamp:new Date(now).toISOString(),level,code,area,
    ...((level==='error'||level==='fatal')&&currentState?{state:currentState}:{}),
    ...((level==='error'||level==='fatal')?{view:Object.freeze({...views})}:{}),
    ...(count!==undefined&&Number.isSafeInteger(count)&&count>=0?{count}:{}),
    ...(correlated?{relatedAction:lastAction.code,relatedActionId:lastAction.id}:{})});
}
/** Tracks deliberate UI interactions; only fixed labels, never search text, names, IDs, or filter values. */
export function recordUserAction(code:UserActionCode,area:DiagnosticArea='dashboard'):void {
  if (!ALLOWED_ACTIONS.has(code)||!ALLOWED_AREAS.has(area)) return;
  const now=Date.now();
  const id=++actionSequence;
  mostRecentAction={code,id,at:now};
  pushEvent({timestamp:new Date(now).toISOString(),level:'info',code,area,kind:'action',actionId:id});
}
/** Record a bounded operation sample; correlations reference the last recent user action, not causality. */
export function recordTiming(name:TimingName,elapsedMs:number):void {
  if (!ALLOWED_TIMINGS.has(name)||!Number.isFinite(elapsedMs)||elapsedMs<0) return;
  const rounded=Math.round(elapsedMs*100)/100;
  const values=samples.get(name)??[];
  values.push(rounded);
  if (values.length>SAMPLE_LIMIT) values.shift();
  samples.set(name,values);
  const now=Date.now();
  const recent=mostRecentAction;
  const linked=recent!==null&&now-recent.at>=0&&now-recent.at<=RELATED_ACTION_MAX_AGE_MS;
  const slow=rounded>OPERATION_THRESHOLDS_MS[name];
  traces.push(Object.freeze({id:++traceSequence,timestamp:new Date(now).toISOString(),
    operation:name,elapsedMs:rounded,slow,
    ...(linked?{relatedAction:recent.code,relatedActionId:recent.id}:{})}));
  if(traces.length>TRACE_LIMIT)traces.shift();
  if(slow)recordEvent('warn','OPERATION_SLOW','app',Math.round(rounded));
  else publish();
}
/** Accept only small, aggregate, numerical summaries of committed dashboard state. */
export function updateDashboardState(state:SanitizedDashboardState):void {
  const next=sanitizeDashboardState(state);
  if(!next)return;
  if(currentState&&Object.keys(next).every(k=>next[k as keyof SanitizedDashboardState]===currentState?.[k as keyof SanitizedDashboardState]))return;
  currentState=next;publish();
}
/** Allowlisted chart choices, never the name of a user-defined view or other raw inputs. */
export function setDiagnosticView(name:DiagnosticView,value:string):void {
  if(!VIEW_NAMES.includes(name)||!VIEW_OPTIONS[name].includes(value)||views[name]===value)return;
  views[name]=value;publish();
}
/** Manual snapshot is deliberately a single sanitized event; errors capture it automatically. */
export function captureStateSnapshot():boolean {
  if(!currentState)return false;
  pushEvent({timestamp:new Date().toISOString(),level:'info',code:'STATE_SNAPSHOT_CAPTURED',area:'dashboard',state:currentState,view:Object.freeze({...views})});
  return true;
}
/** Build fields must match small, known formats; no arbitrary environment strings or paths. */
export function setBuildInfo(input:DiagnosticBuild):void {
  if(!input||typeof input!=='object')return;
  if(typeof input.version!=='string'||!/^\d+\.\d+\.\d+$/.test(input.version) ||
    typeof input.commit!=='string'||!(/^[a-f0-9]{7,40}$/.test(input.commit)||input.commit==='unavailable')||
    typeof input.builtAt!=='string'||!(input.builtAt==='unavailable'||isoDate(input.builtAt))||
    !['development','production','test','unknown'].includes(input.mode))return;
  build=Object.freeze({version:input.version,commit:input.commit,builtAt:input.builtAt,mode:input.mode});publish();
}
/** Browser and OS are broad categories only. Never persist the raw User-Agent string. */
export function setRuntimeEnvironment(info:DiagnosticEnvironment):void {
  if(!info||!['Edge','Chrome','Firefox','Safari','Other'].includes(info.browser)||
    !['Windows','macOS','Linux','Android','iOS','Other'].includes(info.os))return;
  environment=Object.freeze({browser:info.browser,os:info.os});publish();
}
/** The public manifest version and safe counts; reject arbitrary metadata text. */
export function setDatasetMetadata(info:DiagnosticDatasetInfo):void {
  if(!info||info.schemaVersion!==2||!finiteCount(info.orderCount)||!finiteCount(info.itemCount)||
    typeof info.processingVersion!=='string'||!/^[a-zA-Z0-9._-]{1,32}$/.test(info.processingVersion))return;
  datasetInfo=Object.freeze({schemaVersion:info.schemaVersion,processingVersion:info.processingVersion,
    orderCount:info.orderCount,itemCount:info.itemCount});publish();
}
function checkStore(storage:'localStorage'|'sessionStorage',code:HealthCheckCode):HealthCheckResult {
  if(typeof window==='undefined')return {code,status:'unsupported',detail:'no_browser'};
  try {
    const store=window[storage];
    const key=`__commerce_diagnostics_probe_${session.id}_${Math.random().toString(36).slice(2)}`;
    try {store.setItem(key,'ok');if(store.getItem(key)!=='ok')return {code,status:'fail',detail:'blocked'};}
    finally {store.removeItem(key);}
    return {code,status:'pass',detail:'available'};
  } catch {return {code,status:'fail',detail:'blocked'};}
}
/** Non-destructive checks; dataset and geography re-use already validated runtime statuses. */
export function runDiagnosticsHealthChecks():readonly HealthCheckResult[] {
  const dataset=health.dataset,geo=health.geography;
  const result:HealthCheckResult[]=[
    {code:'dataset_validation',status:dataset==='ready'?'pass':dataset==='degraded'?'fail':'warning',detail:dataset==='ready'?'validated':dataset},
    {code:'geography_integrity',status:geo==='ready'?'pass':geo==='degraded'?'fail':'warning',detail:geo==='ready'?'validated':geo},
    checkStore('sessionStorage','session_storage'),
    checkStore('localStorage','local_storage'),
  ];
  healthChecks=result.map(r=>Object.freeze(r));healthCheckedAt=new Date().toISOString();
  const storage=result.slice(2);
  if(storage.every(r=>r.status==='pass'))health.browser_storage='ready';
  else if(storage.some(r=>r.status==='fail'))health.browser_storage='degraded';
  publish();
  recordEvent('info','HEALTH_CHECK_RAN','app',result.filter(r=>r.status!=='pass').length);
  return Object.freeze([...healthChecks]);
}
export function setHealth(name:HealthName,state:HealthState):void {
  if (!(name in health)||!['pending','ready','degraded'].includes(state)||health[name]===state) return;
  health[name]=state;publish();
}
function publish():void {
  const metrics: MetricSummary[]=[...samples].map(([name,values])=>{
    const sorted=[...values].sort((a,b)=>a-b);
    return Object.freeze({name,count:values.length,lastMs:values[values.length-1],
      averageMs:Math.round(values.reduce((sum,n)=>sum+n,0)/values.length*100)/100,
      maxMs:sorted[sorted.length-1],p95Ms:sorted[Math.ceil(.95*sorted.length)-1],
      slowCount:values.filter(v=>v>OPERATION_THRESHOLDS_MS[name]).length});
  });
  snapshot=Object.freeze({session,events:Object.freeze([...events]),
    metrics:Object.freeze(metrics.sort((a,b)=>a.name.localeCompare(b.name))),health:Object.freeze({...health}),
    build,environment,datasetInfo,currentState,views:Object.freeze({...views}),traces:Object.freeze([...traces]),
    healthChecks:Object.freeze([...healthChecks]),healthCheckedAt,
    recoveryAttempts:Object.freeze([...recoveryAttempts])});
  for(const listener of listeners)listener();
}
export function getDiagnosticsSnapshot():DiagnosticSnapshot{return snapshot;}
export function subscribeDiagnostics(listener:()=>void):()=>void {listeners.add(listener);return ()=>{listeners.delete(listener);};}
/** Fixed allowlist of recovery outcomes. Never accept user strings, paths or exception text. */
export function recordRecoveryResult(input:RecoveryDiagnosticRecord):void {
  if(!input||!isoDate(input.timestamp)||!ALLOWED_AREAS.has(input.area)||
    !['dataset','geography','render','storage','csv','unexpected'].includes(input.kind)||
    !['retry','isolate','restore','check_storage'].includes(input.action)||
    !['verified','failed','isolated','checked','unavailable','limit'].includes(input.outcome))return;
  recoveryAttempts.push(Object.freeze({timestamp:input.timestamp,kind:input.kind,area:input.area,
    action:input.action,outcome:input.outcome}));
  if(recoveryAttempts.length>30)recoveryAttempts.shift();
  publish();
}
export function clearDiagnosticsEvents():void {
  events.length=0;mostRecentAction=null;
  persistSession();publish();
}
/** Explicit local export: anonymous session identifier, allowlisted events and bounded timing summaries. */
export function exportDiagnosticsJson():string {
  return JSON.stringify({format:'commerce-dashboard-diagnostics-v3',appVersion:build.version,
    generatedAt:new Date().toISOString(),...getDiagnosticsSnapshot()},null,2);
}
export function clockNow():number {
  return typeof performance!=='undefined'&&typeof performance.now==='function'?performance.now():Date.now();
}
/** Prevent cross-test data leakage. Do not call from application code. */
export function resetDiagnosticsForTests():void {
  events.length=0;recoveryAttempts.length=0;samples.clear();traces.length=0;traceSequence=0;actionSequence=0;mostRecentAction=null;
  currentState=null;build=buildFallback;
  environment=Object.freeze({browser:'Other',os:'Other'});
  datasetInfo=Object.freeze({schemaVersion:null,processingVersion:'unavailable',orderCount:null,itemCount:null});
  healthChecks=[];healthCheckedAt=null;
  Object.assign(views,INITIAL_VIEWS);
  session=newSession();
  health.dataset='pending';health.geography='pending';health.browser_storage='pending';
  if (typeof window!=='undefined')try{window.sessionStorage.removeItem(SESSION_KEY);}catch{/* blocked */}
  publish();
}
/** Capture error type only; neither error.message, stack, URL, nor rejected promise payload. */
export function installGlobalDiagnostics(target:Pick<Window,'addEventListener'|'removeEventListener'>=window):()=>void {
  const handleError=()=>recordEvent('error','UNHANDLED_ERROR','app');
  const handleRejection=()=>recordEvent('error','UNHANDLED_REJECTION','app');
  target.addEventListener('error',handleError);
  target.addEventListener('unhandledrejection',handleRejection);
  return ()=>{target.removeEventListener('error',handleError);target.removeEventListener('unhandledrejection',handleRejection);};
}
