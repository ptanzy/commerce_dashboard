import { useEffect, useState } from 'react';
import { Info, X } from 'lucide-react';

/** Announce visibility changes only: filter-selection actions never create this notification. */
export function HiddenFilterToast({notice,onDismiss}: {notice:{key:number;message:string}|null;onDismiss:()=>void}) {
  const [paused,setPaused]=useState(false);
  useEffect(()=>{setPaused(false);},[notice?.key]);
  useEffect(()=>{
    if (!notice || paused) return;
    const handle=window.setTimeout(onDismiss,4500);
    return ()=>window.clearTimeout(handle);
  },[notice,paused,onDismiss]);
  if (!notice) return null;
  return <div className="workspace-filter-toast" role="status" aria-live="polite" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)} onFocus={()=>setPaused(true)} onBlur={event=>{if(!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget))setPaused(false);}}>
    <Info size={17} aria-hidden="true"/><span>{notice.message} <strong>Filters remain active.</strong></span>
    <button type="button" aria-label="Dismiss filter visibility notice" onClick={onDismiss}><X size={16} aria-hidden="true"/></button>
  </div>;
}
