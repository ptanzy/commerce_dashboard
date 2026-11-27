import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import {
  flexRender, getCoreRowModel, useReactTable,
} from '@tanstack/react-table';
import type { ColumnDef, PaginationState, SortingState } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileSearch, Search, X } from 'lucide-react';
import type { DataIndex } from '../../data/indexes';
import { selectExplorerOrders, selectOrderDetail } from '../../domain/orderExplorer';
import type { ExplorerOrder, OrderDetail } from '../../domain/orderExplorer';
import type { Cohort } from '../../domain/selectors';
import type { Filters, ItemFact } from '../../domain/types';
import { categoryLabel } from '../../domain/selectors';
import { formatInteger } from '../../components/format';
import { stateLabel } from '../../components/stateNames';
import { clockNow, recordTiming, recordUserAction } from '../../observability/diagnostics';

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const formatBRL = (value: number | null): string => value === null || !Number.isFinite(value) ? '—' : money.format(value);
const shown = (value: string | null): string => value ?? '—';
const shownDays = (value: number | null): string => value === null || !Number.isFinite(value) ? '—' : `${decimal.format(value)} d`;
import {TablePageSizeControl,useTablePageSize} from '../../components/TablePageSizeControl';
import type {TablePageSize} from '../../domain/dashboardTablePreferences';

// Sorting by purchase is already the default order in orders.json. Comparators always
// have an order-ID tie break; sorting occurs only when requested by the user.
function compareValues(a: string | number | null, b: string | number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b));
}

function defineColumn(id: string, header: string, accessor: (row: ExplorerOrder) => string | number | null,
  render: (row: ExplorerOrder) => string, label?: string): ColumnDef<ExplorerOrder> {
  return {
    id,
    header,
    sortDescFirst:false,
    accessorFn: accessor,
    sortingFn: (a, b) => compareValues(accessor(a.original), accessor(b.original)) || a.original.orderId.localeCompare(b.original.orderId),
    cell: ({ row }) => <span aria-label={label}>{render(row.original)}</span>,
  };
}

const sortFields: Record<string, (row: ExplorerOrder) => string | number | null> = {
  orderId: r => r.orderId,
  purchaseDate: r => r.purchaseDate,
  customerState: r => r.customerState,
  status: r => r.status,
  deliveryClassification: r => r.deliveryClassification,
  deliveryDays: r => r.deliveryDays,
  matchingPriceBRL: r => r.matchingPriceBRL,
  matchingFreightBRL: r => r.matchingFreightBRL,
};

export function sortExplorerOrders(rows: readonly ExplorerOrder[], sorting: SortingState): readonly ExplorerOrder[] {
  const active = sorting[0];
  const accessor = active && sortFields[active.id];
  if (!accessor) return rows; // Preserve ETL's purchase-descending order by default.
  return [...rows].sort((a, b) => {
    const av = accessor(a), bv = accessor(b);
    // Unknowns sort last in either direction, not as invented zero.
    if (av === null || bv === null) return av === bv ? a.orderId.localeCompare(b.orderId) : av === null ? 1 : -1;
    const compared = compareValues(av, bv);
    return (active.desc ? -compared : compared) || a.orderId.localeCompare(b.orderId);
  });
}

const columns: ColumnDef<ExplorerOrder>[] = [
  { id: 'orderId', header: 'Order ID', sortDescFirst:false, accessorFn: (r) => r.orderId,
    sortingFn: (a,b) => a.original.orderId.localeCompare(b.original.orderId),
    cell: ({ row }) => <span className="order-id" title={row.original.orderId}>{row.original.orderId}</span> },
  defineColumn('purchaseDate', 'Purchased', r => r.purchaseDate, r => shown(r.purchaseDate)),
  defineColumn('customerState', 'Destination', r => r.customerState, r => r.customerState ?? '—'),
  defineColumn('status', 'Status', r => r.status, r => r.status.replaceAll('_',' ')),
  defineColumn('deliveryClassification', 'Delivery', r => r.deliveryClassification, r => r.deliveryClassification.replace('_',' ')),
  defineColumn('deliveryDays', 'Delivery days', r => r.deliveryDays, r => shownDays(r.deliveryDays)),
  defineColumn('matchingPriceBRL', 'Matching item price', r => r.matchingPriceBRL, r => formatBRL(r.matchingPriceBRL)),
  defineColumn('matchingFreightBRL', 'Matching freight', r => r.matchingFreightBRL, r => formatBRL(r.matchingFreightBRL)),
  { id: 'action', header: 'Inspect', enableSorting: false,
    cell: ({ row }) => <span className="inspect-cell" aria-hidden="true">View details <ChevronRight size={14} /></span> },
];

function DetailRow({ item, matched }: {item: ItemFact; matched: boolean}) {
  return <tr className={matched ? 'detail-item-matched' : 'detail-item-unmatched'}>
    <td>#{item.orderItemId}</td>
    <td>{item.sellerState ? stateLabel(item.sellerState) : '—'}</td>
    <td>{categoryLabel(item.category)}</td>
    <td className="numeric-cell">{formatBRL(item.priceBRL)}</td>
    <td className="numeric-cell">{formatBRL(item.freightChargeBRL)}</td>
    <td><span className={`match-pill${matched ? ' is-match' : ''}`}>{matched ? 'Matching' : 'Other'}</span></td>
  </tr>;
}

function OrderDetailDrawer({detail, onClose}: {detail: OrderDetail;onClose:()=>void}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; if (previouslyFocused?.isConnected) previouslyFocused.focus(); };
  }, []);
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {event.stopPropagation(); onClose(); return;}
    if (event.key !== 'Tab') return;
    const controls = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])') ?? [])];
    if (!controls.length) return;
    if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls[controls.length - 1].focus(); }
    if (!event.shiftKey && document.activeElement === controls[controls.length - 1]) { event.preventDefault(); controls[0].focus(); }
  }
  const { order, fullItems, matchingItemIds, matchingTotals, fullTotals } = detail;
  return <div className="order-detail-backdrop" onMouseDown={event=>{ if(event.target===event.currentTarget)onClose(); }}>
    <aside className="order-detail-panel" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="detail-title" onKeyDown={handleKeyDown}>
      <div className="detail-heading"><div><span className="detail-kicker">ORDER RECORD / OLIST</span><h3 id="detail-title">Order details</h3><p className="detail-order-id">{order.orderId}</p></div>
        <button type="button" ref={closeRef} onClick={onClose} aria-label="Close order details" className="detail-close"><X size={20}/></button>
      </div>
      <div className="detail-body">
        <dl className="detail-fields">
          <div><dt>Purchase</dt><dd>{shown(order.purchaseTimestamp)}</dd></div>
          <div><dt>Destination</dt><dd>{order.customerState ? stateLabel(order.customerState) : '—'}</dd></div>
          <div><dt>Status</dt><dd>{order.status}</dd></div>
          <div><dt>Delivery result</dt><dd>{order.deliveryClassification.replace('_',' ')}</dd></div>
          <div><dt>Promised date</dt><dd>{shown(order.estimatedDeliveryDate)}</dd></div>
          <div><dt>Actual delivery</dt><dd>{shown(order.deliveredTimestamp)}</dd></div>
          <div><dt>Delivery duration</dt><dd>{shownDays(order.deliveryDays)}</dd></div>
          <div><dt>Item count</dt><dd>{formatInteger(order.itemCount)}</dd></div>
        </dl>
        <div className="detail-totals" aria-label="Item financial totals">
          <div><span>Matching items ({matchingTotals.matchedItemCount})</span><strong>{formatBRL(matchingTotals.priceBRL)}</strong><small>Item price</small><strong>{formatBRL(matchingTotals.freightChargeBRL)}</strong><small>Charged freight</small></div>
          <div><span>Full order ({fullTotals.matchedItemCount} items)</span><strong>{formatBRL(fullTotals.priceBRL)}</strong><small>Full-order item price</small><strong>{formatBRL(fullTotals.freightChargeBRL)}</strong><small>Full-order freight charged</small></div>
        </div>
        <h4>Original order items</h4>
        <p className="detail-help">The full order is shown for context. Highlighted items match the current seller, category, destination and focused-flow selections. Charges are customer freight charges, not logistics costs.</p>
        {fullItems.length ? <div className="detail-table-wrap"><table className="detail-item-table"><thead><tr><th>Item</th><th>Seller origin</th><th>Category</th><th>Price</th><th>Freight</th><th>Filter</th></tr></thead>
          <tbody>{fullItems.map(item=><DetailRow key={item.orderItemId} item={item} matched={matchingItemIds.has(item.orderItemId)}/>)}</tbody></table></div>
          : <p className="detail-no-items">This order has no item records in the Olist item table; monetary totals are unavailable (—).</p>}
      </div>
    </aside>
  </div>;
}

export function OrderExplorer({index,cohort,filters,pageSize:configuredPageSize,onPageSizeChange}:{
  index:DataIndex;cohort:Cohort;filters:Filters;pageSize?:TablePageSize;
  onPageSizeChange?:(value:TablePageSize)=>void;
}) {
  const [pageSize,changePageSize]=useTablePageSize(configuredPageSize,onPageSizeChange);
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: pageSize });
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const rowsResult=useMemo(()=>{
    const start=clockNow();return {value:selectExplorerOrders(cohort),ms:clockNow()-start};
  },[cohort]);
  const rows=rowsResult.value;
  useEffect(()=>recordTiming('explorer_rows',rowsResult.ms),[rowsResult]);
  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter(row => row.orderId.toLowerCase().includes(q)) : rows;
  }, [rows, search]);
  useEffect(() => {
    setPagination(current => current.pageIndex === 0 ? current : {...current,pageIndex:0});
  }, [cohort, search, sorting]);
  useEffect(() => {
    if (selectedOrderId && !cohort.eligibleOrderIds.has(selectedOrderId)) setSelectedOrderId(null);
  }, [cohort, selectedOrderId]);
  const sortedResult=useMemo(()=>{
    const start=clockNow();return {value:sortExplorerOrders(filteredRows,sorting),ms:clockNow()-start};
  },[filteredRows,sorting]);
  const sortedRows=sortedResult.value;
  useEffect(()=>recordTiming('explorer_sort',sortedResult.ms),[sortedResult]);
  const pageCount = Math.max(1,Math.ceil(sortedRows.length/pageSize));
  const safePage = Math.min(pagination.pageIndex,pageCount-1);
  const pageRows = useMemo(() => sortedRows.slice(safePage*pageSize,(safePage+1)*pageSize), [sortedRows,safePage,pageSize]);
  const table = useReactTable({ data: pageRows, columns, pageCount, manualPagination:true,manualSorting:true,
    state: { sorting, pagination: {...pagination,pageIndex:safePage,pageSize} },
    onSortingChange: setSorting, onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
  });
  useEffect(()=>setPagination(current=>current.pageIndex===0?current:{...current,pageIndex:0}),[pageSize]);
  const selectedDetail = useMemo(() => selectedOrderId ? selectOrderDetail(index,cohort,filters,selectedOrderId) : null,
    [index,cohort,filters,selectedOrderId]);
  const closeOrder = () => setSelectedOrderId(null);
  const currentPage = safePage+1;
  return <section id="order-explorer" className="orders-section" aria-labelledby="orders-heading">
    <div className="panel order-explorer-panel">
      <div className="order-toolbar"><div><h2 id="orders-heading">Order Explorer</h2><p>Selections in the map, trends and flows narrow these results automatically.</p></div>
        <label className="order-search"><Search size={16} aria-hidden="true"/><span className="sr-only">Search order ID</span>
          <input aria-label="Search order ID" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Find order ID…" type="search" /></label></div>
      <div className="order-table-meta" role="status" aria-live="polite">Showing {formatInteger(filteredRows.length)} of {formatInteger(cohort.eligibleOrders.length)} eligible orders{search.trim() ? ' matching ID search' : ''}</div>
      <div className="order-table-scroll"><table className="order-table"><thead>{table.getHeaderGroups().map(headerGroup=><tr key={headerGroup.id}>{headerGroup.headers.map(header=><th key={header.id} scope="col" aria-sort={header.column.getIsSorted()==='asc'?'ascending':header.column.getIsSorted()==='desc'?'descending':'none'}>
        {header.isPlaceholder ? null : header.column.getCanSort() ? <button type="button" className="order-sort" onClick={(event)=>{recordUserAction('ORDER_SORT_CHANGED','orders');header.column.getToggleSortingHandler()?.(event);}} aria-label={`Sort by ${String(header.column.columnDef.header)}`}>
          {flexRender(header.column.columnDef.header,header.getContext())}{header.column.getIsSorted()==='asc'?<ArrowUp size={13}/>:header.column.getIsSorted()==='desc'?<ArrowDown size={13}/>:<ArrowUpDown size={13}/>}</button> : flexRender(header.column.columnDef.header,header.getContext())}
      </th>)}</tr>)}</thead>
      <tbody>{table.getRowModel().rows.length ? table.getRowModel().rows.map(row=><tr key={row.original.orderId}>
        {row.getVisibleCells().map(cell=><td key={cell.id}>{cell.column.id==='action' ? <button type="button" className="order-view-button" onClick={()=>{recordUserAction('ORDER_DETAILS_OPENED','orders');setSelectedOrderId(row.original.orderId);}} aria-label={`View order ${row.original.orderId} details`}>{flexRender(cell.column.columnDef.cell,cell.getContext())}</button> : flexRender(cell.column.columnDef.cell,cell.getContext())}</td>)}
      </tr>) : <tr><td colSpan={columns.length}><div className="order-no-results"><FileSearch size={20}/><span>{search.trim() ? 'No order IDs match this search in the selected cohort.' : 'No orders match the current dashboard filters.'}</span></div></td></tr>}</tbody></table></div>
      <div className="order-pagination"><span>{filteredRows.length ? `Rows ${formatInteger(safePage*pageSize+1)}–${formatInteger(Math.min((safePage+1)*pageSize,filteredRows.length))} of ${formatInteger(filteredRows.length)}` : 'No rows'}</span>
        <TablePageSizeControl label="Order Explorer rows per page" value={pageSize} onChange={size=>{setPagination({pageIndex:0,pageSize:size});changePageSize(size);}}/>
        <div className="page-controls"><button type="button" aria-label="Previous orders page" disabled={!table.getCanPreviousPage()} onClick={()=>table.previousPage()}><ChevronLeft size={18}/></button><span>Page {currentPage} of {pageCount}</span><button type="button" aria-label="Next orders page" disabled={!table.getCanNextPage()} onClick={()=>table.nextPage()}><ChevronRight size={18}/></button></div>
      </div>
    </div>
    {selectedDetail ? <OrderDetailDrawer detail={selectedDetail} onClose={closeOrder} /> : null}
  </section>;
}
