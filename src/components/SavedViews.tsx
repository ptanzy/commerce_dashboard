import { useEffect, useState } from 'react';
import { Bookmark, Save, Trash2 } from 'lucide-react';
import type { Dispatch } from 'react';
import type { FilterAction, Filters } from '../domain/types';
import { SAVED_VIEWS_KEY, SAVED_VIEWS_LIMIT, readSavedViews, readFilterSnapshot } from '../domain/savedViews';
import type { SavedView } from '../domain/savedViews';
import { recordEvent, recordUserAction, setHealth } from '../observability/diagnostics';

function initial(): SavedView[] {
  try{return readSavedViews(JSON.parse(window.localStorage.getItem(SAVED_VIEWS_KEY)??'[]'));}
  catch{return [];}
}
/** Explicit browser-only presets; never send saved data to a server. */
export function SavedViews({filters,dispatch}: {filters:Filters;dispatch:Dispatch<FilterAction>}) {
  const [views,setViews]=useState<SavedView[]>(initial);
  useEffect(()=>{
    try {
      const current=window.localStorage.getItem(SAVED_VIEWS_KEY);
      if (current !== null) JSON.parse(current);
      setHealth('browser_storage','ready');
    } catch {
      setHealth('browser_storage','degraded');
      recordEvent('warn','STORAGE_READ_FAILED','app');
    }
  },[]);
  const [selectedId,setSelectedId]=useState('');
  const [name,setName]=useState('');
  const [notice,setNotice]=useState('');
  const selected=views.find(view=>view.id===selectedId);
  function persist(next:SavedView[],message:string):boolean {
    try {window.localStorage.setItem(SAVED_VIEWS_KEY,JSON.stringify(next));setViews(next);setNotice(message);setHealth('browser_storage','ready');return true;}
    catch {
      recordEvent('warn','STORAGE_WRITE_FAILED','app');
      setHealth('browser_storage','degraded');
      setNotice('Browser storage is unavailable or full. No views were changed.');return false;
    }
  }
  function validatedName():string|null{
    const cleaned=name.trim();
    if(!cleaned||cleaned.length>60){setNotice('Enter a name of 1–60 characters.');return null;}
    return cleaned;
  }
  function save(){
    recordUserAction('SAVED_VIEW_SAVE_REQUESTED','dashboard');
    const cleaned=validatedName();if(!cleaned)return;
    if(views.length>=SAVED_VIEWS_LIMIT){setNotice(`Limit of ${SAVED_VIEWS_LIMIT} saved views reached.`);return;}
    if(views.some(view=>view.name.toLowerCase()===cleaned.toLowerCase())){setNotice('A view with this name already exists. Rename it or choose another name.');return;}
    const snapshot=readFilterSnapshot(filters);
    if(!snapshot){setNotice('The current filter selection cannot be saved.');return;}
    const id=`${Date.now()}-${Math.random().toString(36).slice(2,9)}`;
    if(persist([...views,{id,name:cleaned,filters:snapshot}],`Saved view “${cleaned}”.`)){recordUserAction('SAVED_VIEW_CREATED','dashboard');setSelectedId(id);setName('');}
  }
  function restore(){
    if(!selected)return;
    dispatch({type:'restore_filters',filters:selected.filters});
    setNotice(`Restored “${selected.name}” including selected flows.`);
  }
  function rename(){
    if(!selected)return;
    recordUserAction('SAVED_VIEW_RENAME_REQUESTED','dashboard');
    const cleaned=validatedName();if(!cleaned)return;
    if(views.some(view=>view.id!==selectedId&&view.name.toLowerCase()===cleaned.toLowerCase())){setNotice('Another saved view already has this name.');return;}
    if(persist(views.map(view=>view.id===selectedId?{...view,name:cleaned}:view),`Renamed view to “${cleaned}”.`)){recordUserAction('SAVED_VIEW_RENAMED','dashboard');setName('');}
  }
  function remove(){
    if(!selected)return;
    recordUserAction('SAVED_VIEW_DELETE_REQUESTED','dashboard');
    if(persist(views.filter(view=>view.id!==selectedId),`Deleted “${selected.name}”.`)){recordUserAction('SAVED_VIEW_DELETED','dashboard');setSelectedId('');setName('');}
  }
  return <section className="saved-views" aria-label="Saved filter views">
    <div className="saved-heading"><Bookmark size={16} aria-hidden="true"/><strong>Saved views</strong><span>Browser-only presets · {views.length}/{SAVED_VIEWS_LIMIT}</span></div>
    <div className="saved-controls">
      <label className="saved-input"><span className="sr-only">Saved view name</span><input aria-label="Saved view name" maxLength={60} value={name} onChange={event=>setName(event.target.value)} placeholder="Name this selection…"/></label>
      <button type="button" className="saved-action" onClick={save}><Save size={14} aria-hidden="true"/> Save new</button>
      <label className="saved-select"><span className="sr-only">Choose a saved view</span><select aria-label="Choose a saved view" value={selectedId} onChange={event=>{setSelectedId(event.target.value);setNotice('');}}><option value="">Choose a saved view</option>{views.map(view=><option key={view.id} value={view.id}>{view.name}</option>)}</select></label>
      <button type="button" className="saved-action" disabled={!selected} onClick={restore}>Load</button>
      <button type="button" className="saved-action" disabled={!selected} onClick={rename}>Rename</button>
      <button type="button" className="saved-action saved-danger" disabled={!selected} onClick={remove}><Trash2 size={14} aria-hidden="true"/> Delete</button>
    </div>
    {notice?<p role="status" className="saved-notice">{notice}</p>:null}
  </section>;
}
