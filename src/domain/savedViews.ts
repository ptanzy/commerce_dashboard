import type { Filters, FlowPair } from './types';

export const SAVED_VIEWS_KEY='commerce-dashboard:wu07-filter-views:v1';
export const SAVED_VIEWS_LIMIT=12;
export interface SavedView { id:string; name:string; filters:Filters }
const isRecord=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null&&!Array.isArray(value);
const code=(s:unknown):s is string=>typeof s==='string'&&/^[A-Z]{2}$/.test(s);
const category=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.length<=160&&!/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/.test(s);
const date=(s:unknown):s is string|null=>{
  if(s===null)return true;
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const [year,month,day]=s.split('-').map(Number);
  const d=new Date(Date.UTC(year,month-1,day));
  return d.getUTCFullYear()===year&&d.getUTCMonth()===month-1&&d.getUTCDate()===day;
};
function strings(input:unknown,valid:(x:unknown)=>x is string):string[]|null{
  if(!Array.isArray(input)||input.length>160||!input.every(valid))return null;
  return [...new Set(input)].sort();
}
/** Never trust editable local storage; reject incompatible payloads rather than crash the dashboard. */
export function readFilterSnapshot(input:unknown):Filters|null{
  if(!isRecord(input)||!date(input.purchaseDateFrom)||!date(input.purchaseDateTo))return null;
  const sellerStates=strings(input.sellerStates,code),customerStates=strings(input.customerStates,code),categories=strings(input.categories,category);
  if(!sellerStates||!customerStates||!categories||!Array.isArray(input.focusedFlows)||input.focusedFlows.length>160)return null;
  const focusedFlows:FlowPair[]=[];
  const keys=new Set<string>();
  for(const pair of input.focusedFlows){
    if(!isRecord(pair)||!code(pair.sellerState)||!code(pair.customerState))return null;
    if(sellerStates.length&&!sellerStates.includes(pair.sellerState))continue;
    if(customerStates.length&&!customerStates.includes(pair.customerState))continue;
    const key=`${pair.sellerState}|${pair.customerState}`;
    if(!keys.has(key)){keys.add(key);focusedFlows.push({sellerState:pair.sellerState,customerState:pair.customerState});}
  }
  if(input.purchaseDateFrom&&input.purchaseDateTo&&input.purchaseDateFrom>input.purchaseDateTo)return null;
  return {purchaseDateFrom:input.purchaseDateFrom,purchaseDateTo:input.purchaseDateTo,sellerStates,customerStates,categories,focusedFlows};
}
export function readSavedViews(input:unknown):SavedView[]{
  if(!Array.isArray(input))return [];
  const rows:SavedView[]=[];
  const ids=new Set<string>();
  for(const entry of input.slice(0,SAVED_VIEWS_LIMIT)){
    if(!isRecord(entry)||typeof entry.id!=='string'||entry.id.length>100||!entry.id.trim()||
      typeof entry.name!=='string'||!entry.name.trim()||entry.name.length>60||/[\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/.test(entry.name)||ids.has(entry.id))continue;
    const filters=readFilterSnapshot(entry.filters);
    if(!filters)continue;
    ids.add(entry.id);rows.push({id:entry.id,name:entry.name.trim(),filters});
  }
  return rows;
}
