// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useReducer } from 'react';
import { FilterPanel } from '../../src/components/FilterPanel';
import { useSettledFilters } from '../../src/app/App';
import { DEFAULT_FILTERS } from '../../src/domain/types';
import { filterReducer } from '../../src/app/filterReducer';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function Harness({ large = false }: { large?: boolean }) {
  const [filters, dispatch] = useReducer(filterReducer, DEFAULT_FILTERS);
  const [analytical, pending] = useSettledFilters(filters, large ? 99441 : 3);
  return <>
    <FilterPanel filters={filters} dispatch={dispatch} options={{sellers:['RJ','SP'],customers:['MG','SP'],categories:['books','health_beauty'],dateMin:null,dateMax:null}} matchedCount={3} totalCount={3} updating={pending}/>
    <output data-testid="analytical">{analytical.sellerStates.join(',')}|{analytical.focusedFlows.map(p=>`${p.sellerState}-${p.customerState}`).join(',')}</output>
  </>;
}

describe('WU-10 responsive filter interactions', () => {
  it('dismisses a selection menu outside, but keeps it open when selecting checkboxes', () => {
    render(<Harness/>);
    const seller = screen.getByLabelText('Seller origins').closest('details')!;
    fireEvent.click(screen.getByLabelText('Seller origins'));
    expect(seller.open).toBe(true);
    fireEvent.click(screen.getByRole('checkbox',{name:'Seller origins: SP · São Paulo'}));
    expect(seller.open).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(seller.open).toBe(false);
    expect(screen.getByRole('button',{name:'Clear Origin: SP filter'})).toBeInTheDocument();
  });
  it('opening another menu dismisses the previous menu and Escape closes the current one', () => {
    render(<Harness/>);
    const seller = screen.getByLabelText('Seller origins').closest('details')!;
    const customer = screen.getByLabelText('Customer destinations').closest('details')!;
    fireEvent.click(screen.getByLabelText('Seller origins'));
    fireEvent.pointerDown(screen.getByLabelText('Customer destinations'));
    fireEvent.click(screen.getByLabelText('Customer destinations'));
    expect(seller.open).toBe(false);
    expect(customer.open).toBe(true);
    fireEvent.keyDown(customer,{key:'Escape'});
    expect(customer.open).toBe(false);
  });
  it('coalesces rapid full-data selections without delaying checkbox feedback or losing the final value', () => {
    vi.useFakeTimers();
    render(<Harness large/>);
    fireEvent.click(screen.getByLabelText('Seller origins'));
    fireEvent.click(screen.getByRole('checkbox',{name:'Seller origins: SP · São Paulo'}));
    expect(screen.getByRole('checkbox',{name:'Seller origins: SP · São Paulo'})).toBeChecked();
    expect(screen.getByTestId('analytical')).toHaveTextContent(/^\|$/);
    expect(screen.getByText(/Updating results/)).toBeInTheDocument();
    act(()=>vi.advanceTimersByTime(75));
    fireEvent.click(screen.getByRole('checkbox',{name:'Seller origins: RJ · Rio de Janeiro'}));
    expect(screen.getByRole('checkbox',{name:'Seller origins: RJ · Rio de Janeiro'})).toBeChecked();
    act(()=>vi.advanceTimersByTime(119));
    expect(screen.getByTestId('analytical')).toHaveTextContent(/^\|$/);
    act(()=>vi.advanceTimersByTime(1));
    expect(screen.getByTestId('analytical')).toHaveTextContent('RJ,SP|');
    expect(screen.queryByText(/Updating results/)).not.toBeInTheDocument();
  });
  it('preserves immediate calculation on small datasets', () => {
    render(<Harness/>);
    fireEvent.click(screen.getByLabelText('Seller origins'));
    fireEvent.click(screen.getByRole('checkbox',{name:'Seller origins: SP · São Paulo'}));
    expect(screen.getByTestId('analytical')).toHaveTextContent('SP|');
  });
});
