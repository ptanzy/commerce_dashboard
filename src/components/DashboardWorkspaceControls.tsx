import '../styles/wu11_workspace_manager.css';
import { useState } from 'react';
import type { ReactNode } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { ChevronDown, ChevronUp, Copy, LayoutDashboard, Plus, Save, Trash2, X } from 'lucide-react';
import { DASHBOARD_SECTION_IDS, FULL_DASHBOARD_ID } from '../domain/dashboardWorkspace';
import type { DashboardDefinition } from '../domain/dashboardWorkspace';

export interface WorkspaceControlsProps {
  dashboards: readonly DashboardDefinition[];
  layoutEditor: ReactNode;
  visibleCount: number;
  activeId: string;
  dirty: boolean;
  error: string | null;
  remoteChanged: boolean;
  storageBlocked: boolean;
  onSwitch: (id: string, choice?: 'save' | 'discard') => boolean;
  onSave: () => boolean;
  onDiscard: () => void;
  onCreate: (name: string, fromCurrent: boolean) => boolean;
  onDuplicate: () => boolean;
  onRename: (name: string) => boolean;
  onDelete: () => boolean;
  onImport: (file: File) => void;
  onExport: () => void;
  onReload: () => boolean;
}

const WORKSPACE_DISCLOSURE_KEY='commerce-dashboard:wu11-workspace-open:v1';
function initialExpanded():boolean {
  try{return window.sessionStorage.getItem(WORKSPACE_DISCLOSURE_KEY)==='1';}catch{return false;}
}

/** One compact disclosure owns dashboard management and layout customization. */
export function DashboardWorkspaceControls(props:WorkspaceControlsProps) {
  const [expanded,setExpanded] = useState(initialExpanded);
  const [editor,setEditor] = useState<'new'|'rename'|'delete'|null>(null);
  function toggleExpanded() {
    setExpanded(previous=>{
      const next=!previous;
      try{window.sessionStorage.setItem(WORKSPACE_DISCLOSURE_KEY,next?'1':'0');}catch{/* Session storage is optional. */}
      return next;
    });
  }
  const [name,setName]=useState('');
  const [fromCurrent,setFromCurrent]=useState(true);
  const [pending,setPending]=useState<string|null>(null);
  const active=props.activeId === FULL_DASHBOARD_ID ? 'Full Dashboard' : props.dashboards.find(d=>d.id===props.activeId)?.name ?? 'Full Dashboard';
  const isFull=props.activeId === FULL_DASHBOARD_ID;
  const actionDisabled=props.storageBlocked || props.remoteChanged;

  function begin(mode:'new'|'rename'|'delete') {
    setPending(null);setEditor(mode);
    setName(mode==='rename'?active:'');setFromCurrent(true);
  }
  function switchTo(next:string) {
    if(next===props.activeId)return;
    if(props.dirty){setPending(next);setEditor(null);return;}
    props.onSwitch(next);
  }
  function decide(choice:'save'|'discard') {
    if(!pending)return;
    if(props.onSwitch(pending,choice))setPending(null);
  }
  function submitName(event:FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok=editor==='new'?props.onCreate(name,fromCurrent):editor==='rename'?props.onRename(name):false;
    if(ok){setEditor(null);setName('');}
  }
  function pickFile(event:ChangeEvent<HTMLInputElement>) {
    const file=event.target.files?.[0];
    if(file)props.onImport(file);
    event.target.value='';
  }
  return <section className={`workspace-manager${expanded?' workspace-manager-open':''}`} aria-label="Dashboard workspace manager">
    <div className="workspace-manager-heading">
      <button type="button" className="workspace-manager-disclosure" aria-label={expanded?'Collapse Dashboard Workspace':'Expand Dashboard Workspace'}
        aria-expanded={expanded} aria-controls="workspace-manager-content" onClick={toggleExpanded}>
        <LayoutDashboard size={18} aria-hidden="true"/>
        <span className="workspace-manager-heading-text"><strong>Dashboard Workspace</strong><span>{active} · {props.visibleCount} of {DASHBOARD_SECTION_IDS.length} panels visible</span></span>
        <span className={`workspace-manager-state${props.dirty?' workspace-manager-unsaved':''}`}>{props.dirty?'Unsaved changes':'Saved configuration'}</span>
        {expanded?<ChevronUp size={18} aria-hidden="true"/>:<ChevronDown size={18} aria-hidden="true"/>}
      </button>
    </div>
    <div className="workspace-manager-content" id="workspace-manager-content" hidden={!expanded}>
    <p className="workspace-manager-intro">Create, arrange, and save independent dashboards. Changes are drafts until you save them.</p>
    <div className="workspace-manager-toolbar">
      <label className="workspace-manager-select-label">Dashboard
        <select aria-label="Current dashboard" value={props.activeId} onChange={event=>switchTo(event.target.value)}>
          <option value={FULL_DASHBOARD_ID}>Full Dashboard (protected)</option>
          {props.dashboards.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </label>
      <button type="button" onClick={()=>begin('new')} disabled={actionDisabled}><Plus size={15} aria-hidden="true"/> New</button>
      <button type="button" onClick={props.onDuplicate} disabled={actionDisabled}><Copy size={15} aria-hidden="true"/> Duplicate</button>
      {!isFull?<button type="button" onClick={()=>begin('rename')} disabled={actionDisabled}>Rename</button>:null}
      {!isFull?<button type="button" onClick={()=>begin('delete')} disabled={actionDisabled}><Trash2 size={15} aria-hidden="true"/> Delete</button>:null}
      <button type="button" onClick={props.onSave} disabled={!props.dirty||isFull||actionDisabled}><Save size={15} aria-hidden="true"/> Save</button>
      <button type="button" onClick={props.onDiscard} disabled={!props.dirty}>Discard changes</button>
    </div>
    {props.dirty&&isFull?<p className="workspace-manager-hint">The Full Dashboard is protected. Use New or Duplicate to preserve your customization.</p>:null}
    <div className="workspace-manager-transfer">
      <button type="button" onClick={props.onExport} disabled={isFull}>Export dashboard JSON</button>
      <label>Import dashboard JSON <input aria-label="Import dashboard JSON file" type="file" accept=".json,application/json" onChange={pickFile} disabled={actionDisabled}/></label>
    </div>
    {editor==='new'||editor==='rename'?<form className="workspace-manager-form" onSubmit={submitName}>
      <label>{editor==='new'?'New dashboard name':'Rename dashboard'}<input autoFocus value={name} maxLength={60} onChange={event=>setName(event.target.value)} required/></label>
      {editor==='new'?<label className="workspace-manager-checkbox"><input type="checkbox" checked={fromCurrent} onChange={event=>setFromCurrent(event.target.checked)}/> Copy current sections and filters (uncheck to start from Full Dashboard)</label>:null}
      <button type="submit" disabled={actionDisabled}>{editor==='new'?'Create dashboard':'Save name'}</button>
      <button type="button" onClick={()=>setEditor(null)}>Cancel</button>
    </form>:null}
    {editor==='delete'?<div className="workspace-manager-confirm" role="group" aria-label="Confirm dashboard deletion">
      <strong>Delete {active}?</strong><span>This removes its saved configuration. Your dataset and saved filter views stay intact.</span>
      <button type="button" onClick={()=>{if(props.onDelete())setEditor(null);}} disabled={actionDisabled}>Confirm delete</button>
      <button type="button" onClick={()=>setEditor(null)}>Cancel</button>
    </div>:null}
    {pending?<div className="workspace-manager-confirm" role="group" aria-label="Unsaved dashboard changes">
      <strong>Unsaved changes</strong><span>Save or discard your current layout and filters before switching dashboards.</span>
      {!isFull?<button type="button" disabled={actionDisabled} onClick={()=>decide('save')}>Save and switch</button>:null}
      <button type="button" onClick={()=>decide('discard')} disabled={actionDisabled}>Discard and switch</button>
      <button type="button" onClick={()=>setPending(null)}><X size={14} aria-hidden="true"/> Cancel</button>
      {isFull?<p>The protected Full Dashboard cannot be saved in place. Choose New to preserve it.</p>:null}
    </div>:null}
    {props.layoutEditor}
    </div>
    {props.remoteChanged?<div className="workspace-manager-warning" role="alert">Saved dashboards changed in another tab. Local edits are preserved; reload the saved configurations before writing again. <button type="button" onClick={props.onReload}>Reload saved dashboards</button></div>:null}
    {props.error?<p className="workspace-manager-warning" role="alert">{props.error}</p>:null}
  </section>;
}
