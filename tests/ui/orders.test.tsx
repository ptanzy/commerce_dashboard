// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { buildDataIndex } from '../../src/data/indexes';
import { OrderExplorer, formatBRL } from '../../src/features/orders/OrderExplorer';
import { selectExplorerOrders, selectOrderDetail } from '../../src/domain/orderExplorer';
import { selectCohort } from '../../src/domain/selectors';
import { DEFAULT_FILTERS } from '../../src/domain/types';
import { dataset, orders } from './fixtures';

const filters = {...DEFAULT_FILTERS};
const noFilterCohort = selectCohort(dataset.index,filters);
const explorer = (current = noFilterCohort, f = filters, index = dataset.index) =>
  render(<OrderExplorer index={index} cohort={current} filters={f}/>);

function orderRows(){return within(screen.getByRole('table')).getAllByRole('row').slice(1);}

afterEach(()=>{cleanup();document.body.style.overflow='';});

describe('WU-04 analytical order explorer contracts',()=>{
  it('keeps exactly one row per eligible order, including zero-item orders with unavailable amounts',()=>{
    const data=selectExplorerOrders(noFilterCohort);
    expect(data.map(row=>row.orderId)).toEqual(['multi','single','zero']);
    expect(data.find(row=>row.orderId==='zero')?.matchingItemCount).toBe(0);
    expect(data.find(row=>row.orderId==='zero')?.matchingPriceBRL).toBeNull();
    explorer();
    expect(screen.getByText('Showing 3 of 3 eligible orders')).toBeInTheDocument();
    expect(orderRows()).toHaveLength(3);
    const zero = screen.getByRole('button',{name:'View order zero details'}).closest('tr');
    expect(zero).toHaveTextContent('—');
    expect(formatBRL(null)).toBe('—');
    expect(formatBRL(0)).not.toBe('—');
  });

  it('uses only matched items in rows, but details keep complete original order totals',()=>{
    const f={...filters,sellerStates:['SP'],categories:['health_beauty']};
    const cohort=selectCohort(dataset.index,f);
    const rows=selectExplorerOrders(cohort);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({orderId:'multi',matchingItemCount:1,matchingPriceBRL:100,matchingFreightBRL:10});
    const detail=selectOrderDetail(dataset.index,cohort,f,'multi');
    expect(detail?.fullItems).toHaveLength(2);
    expect(detail?.matchingTotals).toMatchObject({matchedItemCount:1,priceBRL:100,freightChargeBRL:10});
    expect(detail?.fullTotals).toMatchObject({matchedItemCount:2,priceBRL:300,freightChargeBRL:50});
    expect(detail?.matchingItemIds.has(1)).toBe(true);
    expect(detail?.matchingItemIds.has(2)).toBe(false);
    explorer(cohort,f);
    expect(orderRows()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button',{name:'View order multi details'}));
    const dialog=screen.getByRole('dialog',{name:'Order details'});
    expect(within(dialog).getByText('Matching items (1)')).toBeInTheDocument();
    expect(within(dialog).getByText('Full order (2 items)')).toBeInTheDocument();
    expect(within(dialog).getByText(formatBRL(300))).toBeInTheDocument();
    expect(within(dialog).getByText(formatBRL(50))).toBeInTheDocument();
    expect(within(dialog).getAllByText('Matching')).toHaveLength(1);
    expect(within(dialog).getAllByText('Other')).toHaveLength(1);
  });

  it('opens zero-item details without inventing amounts and restores focus on Escape',async()=>{
    explorer();
    const trigger=screen.getByRole('button',{name:'View order zero details'});
    trigger.focus();
    fireEvent.click(trigger);
    const dialog=screen.getByRole('dialog',{name:'Order details'});
    expect(within(dialog).getByText(/no item records/i)).toBeInTheDocument();
    expect(within(dialog).getAllByText('—').length).toBeGreaterThanOrEqual(2);
    expect(within(dialog).getByRole('button',{name:'Close order details'})).toHaveFocus();
    fireEvent.keyDown(dialog,{key:'Escape'});
    await waitFor(()=>expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it('filters only by ID and shows accurate empty search state',()=>{
    explorer();
    const input=screen.getByRole('searchbox',{name:'Search order ID'});
    fireEvent.change(input,{target:{value:'SINGLE'}});
    expect(orderRows()).toHaveLength(1);
    expect(screen.getByText(/Showing 1 of 3 eligible orders/)).toBeInTheDocument();
    fireEvent.change(input,{target:{value:'does-not-exist'}});
    expect(screen.getByText(/No order IDs match this search/)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Next orders page'})).toBeDisabled();
  });

  it('supports deterministic sorting by delivery duration',()=>{
    explorer();
    fireEvent.click(screen.getByRole('button',{name:'Sort by Delivery days'}));
    expect(screen.getByRole('columnheader',{name:/Delivery days/})).toHaveAttribute('aria-sort','ascending');
    const first=orderRows()[0];
    expect(first).toHaveTextContent('multi');
  });

  it('paginates at 25 rows without mounting all eligible orders',()=>{
    const more=Array.from({length:53},(_,i)=>({...orders[2],orderId:`new-${String(i).padStart(3,'0')}`}));
    const index=buildDataIndex(more,[]);
    const cohort=selectCohort(index,filters);
    explorer(cohort,filters,index);
    expect(orderRows()).toHaveLength(25);
    expect(screen.getByText('Page 1 of 3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Next orders page'}));
    expect(orderRows()).toHaveLength(25);
    fireEvent.click(screen.getByRole('button',{name:'Next orders page'}));
    expect(orderRows()).toHaveLength(3);
    expect(screen.getByRole('button',{name:'Next orders page'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Previous orders page'}));
    expect(orderRows()).toHaveLength(25);
  });

  it('honors the chart-applied cohort, including empty seller/category intersection',()=>{
    const f={...filters,sellerStates:['SP'],categories:['books']};
    explorer(selectCohort(dataset.index,f),f);
    expect(screen.getByText(/No orders match the current dashboard filters/)).toBeInTheDocument();
    expect(screen.getByText('Showing 0 of 0 eligible orders')).toBeInTheDocument();
  });
});
