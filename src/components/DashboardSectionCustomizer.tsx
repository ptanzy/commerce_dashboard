import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, RotateCcw } from 'lucide-react';
import { DASHBOARD_SECTIONS } from '../domain/dashboardWorkspace';
import type { DashboardSectionId } from '../domain/dashboardWorkspace';

interface Props {
  hiddenSections: readonly DashboardSectionId[];
  sectionOrder: readonly DashboardSectionId[];
  onShift: (id: DashboardSectionId, direction: -1 | 1) => void;
  onMove: (moving: DashboardSectionId, target: DashboardSectionId) => void;
  onToggle: (id: DashboardSectionId, visible: boolean) => void;
  onReset: () => void;
  filterPanelVisible: boolean;
  onToggleFilterPanel: (visible: boolean) => void;
}

/** One ordered list is both the visibility editor and the order preview.
 * Hidden IDs remain in the sequence, and edits stay in the workspace draft until Save. */
export function DashboardSectionCustomizer({sectionOrder,hiddenSections,onToggle,onShift,onMove,onReset,filterPanelVisible,onToggleFilterPanel}: Props) {
  const [dragging,setDragging] = useState<DashboardSectionId|null>(null);
  const [lastMoved,setLastMoved] = useState('');
  const labels = Object.fromEntries(DASHBOARD_SECTIONS.map(section=>[section.id,section.label])) as Record<DashboardSectionId,string>;
  const shift=(id:DashboardSectionId,direction:-1|1)=>{
    onShift(id,direction);
    setLastMoved(`${labels[id]} moved ${direction===-1?'up':'down'}.`);
  };
  return <div className="workspace-section-options" aria-label="Dashboard layout editor">
    <fieldset className="workspace-order-fieldset">
      <legend>Dashboard sections</legend>
      <p className="workspace-order-help">Check a section to show it. Drag a row to change its position, or use the Move up / Move down buttons. Hidden sections keep their positions.</p>
      <ol className="workspace-order-list" aria-label="Section order">
        {sectionOrder.map((id,index)=>{
          const hidden=hiddenSections.includes(id);
          return <li key={id} draggable
            className={`workspace-order-item${hidden?' workspace-order-item-hidden':''}${dragging===id?' workspace-order-dragging':''}`}
            onDragStart={event=>{setDragging(id);event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',id);}}
            onDragOver={event=>{if(dragging)event.preventDefault();}}
            onDrop={event=>{event.preventDefault();if(dragging&&dragging!==id){onMove(dragging,id);setLastMoved(`${labels[dragging]} moved to position ${index+1}.`);}setDragging(null);}}
            onDragEnd={()=>setDragging(null)}>
            <GripVertical size={16} aria-hidden="true" />
            <span className="workspace-order-number" aria-hidden="true">{index+1}.</span>
            <label className="workspace-order-visibility">
              <input type="checkbox" checked={!hidden} onChange={event=>onToggle(id,event.target.checked)}/>
              <span className="workspace-order-name">{labels[id]}</span>
            </label>
            {hidden?<span className="workspace-order-hidden">Hidden</span>:null}
            <div className="workspace-order-actions">
              <button type="button" aria-label={`Move ${labels[id]} up`} onClick={()=>shift(id,-1)} disabled={index===0}><ArrowUp size={15} aria-hidden="true" /></button>
              <button type="button" aria-label={`Move ${labels[id]} down`} onClick={()=>shift(id,1)} disabled={index===sectionOrder.length-1}><ArrowDown size={15} aria-hidden="true" /></button>
            </div>
          </li>;
        })}
      </ol>
      <p className="workspace-order-announcement" role="status" aria-live="polite">{lastMoved}</p>
    </fieldset>
    <fieldset className="workspace-filter-visibility"><legend>Filter controls</legend>
      <label className="workspace-section-option"><input type="checkbox" checked={filterPanelVisible} onChange={event=>onToggleFilterPanel(event.target.checked)}/><span>Show full filter panel</span></label>
      <p>Hiding the controls never clears active filters. The compact filter summary remains accessible below the workspace.</p>
    </fieldset>
    <div className="workspace-customizer-footer">
      <span>Save or discard your changes using the workspace controls above. Hidden sections do not clear filters or chart preferences.</span>
      <button type="button" className="workspace-customizer-reset" onClick={onReset} disabled={hiddenSections.length===0 && filterPanelVisible}>
        <RotateCcw size={14} aria-hidden="true" /> Show all sections
      </button>
    </div>
  </div>;
}
