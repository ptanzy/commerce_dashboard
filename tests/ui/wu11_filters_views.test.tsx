// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DashboardContent } from '../../src/app/App';
import { dataset } from './fixtures';
import { SAVED_VIEWS_KEY } from '../../src/domain/savedViews';
import { DASHBOARD_STORAGE_KEY } from '../../src/domain/dashboardWorkspace';

afterEach(() => {cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
const toggle = () => fireEvent.click(screen.getByRole('button',{name:'Filters & Views'}));

function chooseSeller() {
  const summary = screen.getByLabelText('Seller origins');
  fireEvent.click(summary);
  fireEvent.click(screen.getByRole('checkbox',{name:'Seller origins: SP · São Paulo'}));
}

describe('WU-11 unified Filters & Views', () => {
  it('starts compact beneath Dashboard Workspace and keeps filter status visible', () => {
    render(<DashboardContent dataset={dataset}/>);
    const workspace = screen.getByRole('region',{name:'Dashboard workspace manager'});
    const shell = screen.getByRole('region',{name:'Filters & Views'});
    expect(workspace.compareDocumentPosition(shell)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button',{name:'Filters & Views'})).toHaveAttribute('aria-expanded','false');
    expect(within(shell).getByText('No filters active')).toBeInTheDocument();
    expect(within(shell).getByText('3 of 3 orders')).toBeInTheDocument();
    expect(screen.queryByRole('region',{name:'Dashboard filters'})).not.toBeInTheDocument();
    expect(screen.queryByRole('region',{name:'Saved filter views'})).not.toBeInTheDocument();
    expect(document.querySelectorAll('.filters-views')).toHaveLength(1);
  });

  it('keeps an active Sankey constraint inspectable and removable when the controls are collapsed', () => {
    render(<DashboardContent dataset={dataset}/>);
    const choices=within(screen.getByRole('group',{name:'Focus a directed seller-to-customer state pair'}));
    fireEvent.click(choices.getByRole('button',{name:/SP.*MG.*1 items/}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    const active=within(screen.getByRole('region',{name:'Active dashboard filter context'}));
    expect(active.getByRole('button',{name:/Filters Active/})).toHaveTextContent(/Filters Active\s*1/);
    fireEvent.click(active.getByRole('button',{name:/Filters Active/}));
    expect(active.getByText('Focused flow: SP → MG')).toBeInTheDocument();
    fireEvent.click(active.getByRole('button',{name:'Remove active flow filter SP→MG'}));
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('3');
    expect(active.getByText('No filters active')).toBeInTheDocument();
    expect(screen.queryByText('Filters remain active.')).not.toBeInTheDocument();
  });

  it('does not discard filter selections or a partially typed preset name when collapsed', () => {
    render(<DashboardContent dataset={dataset}/>);
    toggle();
    chooseSeller();
    fireEvent.click(screen.getByText('Saved filter views'));
    const views=within(screen.getByRole('region',{name:'Saved filter views'}));
    fireEvent.change(views.getByRole('textbox',{name:'Saved view name'}),{target:{value:'SP sellers'}});
    toggle();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    const active=within(screen.getByRole('region',{name:'Active dashboard filter context'}));
    expect(active.getByRole('button',{name:/Filters Active/})).toHaveTextContent(/Filters Active\s*1/);
    toggle();
    expect(views.getByRole('textbox',{name:'Saved view name'})).toHaveValue('SP sellers');
    fireEvent.click(views.getByRole('button',{name:'Save new'}));
    expect(JSON.parse(localStorage.getItem(SAVED_VIEWS_KEY)!)).toHaveLength(1);
    expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
    expect(screen.getByText(/1\/12 · Reusable filter presets/)).toBeInTheDocument();
  });

  it('respects saved-dashboard filter-panel visibility without hiding current filter context or saved views', () => {
    render(<DashboardContent dataset={dataset}/>);
    toggle();
    chooseSeller();
    fireEvent.click(screen.getByRole('button',{name:'Expand Dashboard Workspace'}));
    fireEvent.click(screen.getByRole('checkbox',{name:'Show full filter panel'}));
    expect(screen.queryByRole('region',{name:'Dashboard filters'})).not.toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Show filter controls'})).toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    expect(screen.getByText('Filter controls hidden.')).toBeInTheDocument();
    const saved=screen.getByText('Saved filter views');
    fireEvent.click(saved);
    expect(screen.getByRole('region',{name:'Saved filter views'})).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Show filter controls'}));
    expect(screen.getByRole('region',{name:'Dashboard filters'})).toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
  });
});
