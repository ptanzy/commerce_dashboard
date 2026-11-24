import type { Cohort } from './selectors';
import { selectExplorerOrders } from './orderExplorer';

const FIELDS=[
  'order_id','purchase_date','customer_state','status','delivery_classification',
  'delivery_days','matching_item_count','matching_item_price_brl','matching_freight_charge_brl',
] as const;
/** No names, customer IDs or seller IDs exported. A missing amount stays blank, not zero. */
function cell(input: string | number | null):string {
  if(input===null)return '';
  let value=String(input);
  // Prevent spreadsheet formula interpretation, including after leading whitespace.
  if(typeof input==='string' && /^[\s\uFEFF]*[=+\-@]/.test(value))value="'"+value;
  return '"'+value.replaceAll('"','""')+'"';
}
export function exportCohortCsv(cohort:Cohort):string {
  const rows=selectExplorerOrders(cohort);
  const result=[FIELDS.join(',')];
  for(const row of rows){
    result.push([
      row.orderId,row.purchaseDate,row.customerState,row.status,row.deliveryClassification,
      row.deliveryDays,row.matchingItemCount,row.matchingPriceBRL,row.matchingFreightBRL,
    ].map(cell).join(','));
  }
  return '\ufeff'+result.join('\r\n')+'\r\n';
}
