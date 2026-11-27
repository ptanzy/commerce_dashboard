import {useState} from 'react';
import {DEFAULT_TABLE_PAGE_SIZE,TABLE_PAGE_SIZE_OPTIONS} from '../domain/dashboardTablePreferences';
import type {TablePageSize} from '../domain/dashboardTablePreferences';

/** Falls back to local state for an isolated table; dashboard-mounted tables use saved drafts. */
export function useTablePageSize(configured?:TablePageSize,onChange?:(value:TablePageSize)=>void) {
  const [local,setLocal]=useState<TablePageSize>(configured??DEFAULT_TABLE_PAGE_SIZE);
  return [onChange ? (configured??local) : local,
    (next:TablePageSize)=>{ if(onChange)onChange(next);else setLocal(next); }] as const;
}

export function TablePageSizeControl({label,value,onChange}:{
  label:string;value:TablePageSize;onChange:(value:TablePageSize)=>void;
}) {
  return <label className="table-page-size-control">Rows per page
    <select aria-label={label} value={value} onChange={event=>onChange(Number(event.target.value) as TablePageSize)}>
      {TABLE_PAGE_SIZE_OPTIONS.map(size=><option key={size} value={size}>{size}</option>)}
    </select>
  </label>;
}
