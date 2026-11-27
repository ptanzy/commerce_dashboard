// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DashboardContent } from '../../src/app/App';
import { DASHBOARD_STORAGE_KEY } from '../../src/domain/dashboardWorkspace';
import { dataset } from './fixtures';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
const open=()=>fireEvent.click(screen.getByRole('button',{name:'Expand Dashboard Workspace'}));

// The control list is shared by both operations; no parallel checkbox grid exists.
describe('WU-11 unified collapsible dashboard workspace',()=>{
  it('starts compact above Filters Active, with a single layout editor when expanded',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const workspace=screen.getByRole('region',{name:'Dashboard workspace manager'});
    const filters=screen.getByRole('region',{name:'Active dashboard filter context'});
    expect(workspace).toHaveTextContent('Full Dashboard · 8 of 8 panels visible');
    expect(workspace.compareDocumentPosition(filters) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('button',{name:'Expand Dashboard Workspace'})).toHaveAttribute('aria-expanded','false');
    expect(screen.queryByRole('list',{name:'Section order'})).not.toBeInTheDocument();
    expect(screen.queryByRole('button',{name:'New'})).not.toBeInTheDocument();
    open();
    expect(screen.getByRole('button',{name:'Collapse Dashboard Workspace'})).toHaveAttribute('aria-expanded','true');
    const editor=within(screen.getByRole('list',{name:'Section order'}));
    expect(editor.getAllByRole('checkbox')).toHaveLength(8);
    expect(editor.getByRole('button',{name:'Move Delivery trends up'})).toBeInTheDocument();
    expect(screen.queryByText('Show or hide dashboard sections')).not.toBeInTheDocument();
  });

  it('uses each ordered row to hide, restore and move the same section',()=>{
    render(<DashboardContent dataset={dataset}/>);
    open();
    const editor=within(screen.getByRole('list',{name:'Section order'}));
    const trendBox=editor.getByRole('checkbox',{name:'Delivery trends'});
    const original=[...document.querySelectorAll('[data-dashboard-section]')].map(node=>node.getAttribute('data-dashboard-section'));
    fireEvent.click(trendBox);
    expect(screen.queryByRole('heading',{name:'Delivery trends'})).not.toBeInTheDocument();
    expect(screen.getByRole('region',{name:'Dashboard workspace manager'})).toHaveTextContent('7 of 8 panels visible');
    fireEvent.click(editor.getByRole('button',{name:'Move Delivery trends up'}));
    fireEvent.click(trendBox);
    const reordered=[...document.querySelectorAll('[data-dashboard-section]')].map(node=>node.getAttribute('data-dashboard-section'));
    expect(reordered.indexOf('deliveryTrends')).toBeLessThan(reordered.indexOf('geographicDistribution'));
    expect(original.indexOf('deliveryTrends')).toBeGreaterThan(original.indexOf('geographicDistribution'));
    expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
  });

  it('remembers disclosure within the session without persisting layout drafts implicitly',()=>{
    const initial=render(<DashboardContent dataset={dataset}/>);
    open();
    expect(sessionStorage.getItem('commerce-dashboard:wu11-workspace-open:v1')).toBe('1');
    initial.unmount();
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.getByRole('button',{name:'Collapse Dashboard Workspace'})).toBeInTheDocument();
    expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Collapse Dashboard Workspace'}));
    expect(sessionStorage.getItem('commerce-dashboard:wu11-workspace-open:v1')).toBe('0');
  });

  it('removes fixed narrative titles without losing panel titles or data functionality',()=>{
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.queryByText(/02 \/ EXPLORE THE PATTERNS/)).not.toBeInTheDocument();
    expect(screen.queryByText(/03 \/ INSPECT THE RECORDS/)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Beyond the numbers'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Explore the details'})).not.toBeInTheDocument();
    expect(screen.queryByRole('heading',{name:'Behind every delivery'})).not.toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Executive KPIs'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Order Explorer'})).toBeInTheDocument();
    expect(screen.getByRole('heading',{name:'Product category leaderboard'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Export filtered orders/})).toBeInTheDocument();
    expect(screen.getByRole('link',{name:/View matching orders/})).toHaveAttribute('href','#order-explorer');
  });
});
