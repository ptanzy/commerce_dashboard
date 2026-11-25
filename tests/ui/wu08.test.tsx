// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, act, within } from '@testing-library/react';
import { DiagnosticsPanel } from '../../src/components/DiagnosticsPanel';
import { CsvExportButton } from '../../src/components/AdvancedExploration';
import { selectCohort } from '../../src/domain/selectors';
import { DEFAULT_FILTERS } from '../../src/domain/types';
import { dataset } from './fixtures';
import { UiErrorBoundary } from '../../src/observability/UiErrorBoundary';
import {
  recordEvent, recordUserAction, recordTiming, getDiagnosticsSnapshot, resetDiagnosticsForTests,
  setHealth, updateDashboardState, setBuildInfo, setDiagnosticView,
} from '../../src/observability/diagnostics';

beforeEach(()=>resetDiagnosticsForTests());
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();resetDiagnosticsForTests();});

describe('WU-08 diagnostics and recovery',()=>{
  it('starts closed and displays safe events, component health and measured durations on request',()=>{
    render(<DiagnosticsPanel/>);
    expect(screen.queryByRole('region',{name:'Application diagnostics'})).not.toBeInTheDocument();
    act(()=>{recordEvent('warn','STORAGE_WRITE_FAILED','app');recordTiming('cohort_filter',12.5);});
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const panel=within(screen.getByRole('region',{name:'Application diagnostics'}));
    expect(panel.getByText('STORAGE_WRITE_FAILED')).toBeInTheDocument();
    expect(panel.getAllByText('Apply global filters').length).toBeGreaterThan(0);
    expect(panel.getAllByText('12.5 ms').length).toBeGreaterThan(0);
    fireEvent.click(panel.getByRole('button',{name:'Clear events'}));
    expect(getDiagnosticsSnapshot().events).toHaveLength(0);
    expect(panel.getByText('No events recorded.')).toBeInTheDocument();
  });
  it('shows anonymous session actions and the immediately related error',()=>{
    render(<DiagnosticsPanel/>);
    act(()=>{recordUserAction('ORIGIN_SELECTION_CHANGED','dashboard');
      recordUserAction('FLOW_SELECTION_CHANGED','sankey');
      recordEvent('error','RENDER_FAILED','sankey');});
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const panel=within(screen.getByRole('region',{name:'Application diagnostics'}));
    expect(panel.getByText(/Anonymous session/)).toBeInTheDocument();
    expect(panel.getByText(/After FLOW_SELECTION_CHANGED/)).toBeInTheDocument();
    expect(panel.getByText('Session errors (1)')).toBeInTheDocument();
    expect(panel.getByText('Session activity and system events (4)')).toBeInTheDocument();
    expect(panel.getAllByText('FLOW_SELECTION_CHANGED').length).toBeGreaterThan(0);
    expect(window.sessionStorage.getItem('commerce-dashboard-anonymous-diagnostics-v1')).toContain('FLOW_SELECTION_CHANGED');
  });
  it('shows state snapshots, build identity, health checks and correlated performance warnings',()=>{
    const state={origins:2,destinations:3,categories:1,focusedFlows:2,eligibleOrders:17,dateFiltered:true};
    act(()=>{
      updateDashboardState(state);
      setBuildInfo({version:'0.6.0',commit:'0123456789ab',builtAt:'2026-11-24T01:20:30.000Z',mode:'test'});
      setDiagnosticView('sankeyMeasure','freight');
      setHealth('dataset','ready');setHealth('geography','ready');
      recordUserAction('FLOW_SELECTION_CHANGED','sankey');
      recordTiming('sankey_aggregation',600);
      recordEvent('error','RENDER_FAILED','sankey');
    });
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const panel=within(screen.getByRole('region',{name:'Application diagnostics'}));
    expect(panel.getByText('0123456789ab')).toBeInTheDocument();
    expect(panel.getAllByText('600.0 ms').length).toBeGreaterThan(0);
    expect(panel.getByText(/After FLOW_SELECTION_CHANGED/)).toBeInTheDocument();
    expect(panel.getByText(/Snapshot: 17 orders/)).toBeInTheDocument();
    expect(panel.getByText(/Sankey freight/)).toBeInTheDocument();
    fireEvent.click(panel.getByRole('button',{name:'Run health checks'}));
    expect(panel.getByText('Dataset validation')).toBeInTheDocument();
    expect(panel.getByText('Brazil state topology')).toBeInTheDocument();
    fireEvent.click(panel.getByRole('button',{name:'Capture state snapshot'}));
    expect(getDiagnosticsSnapshot().events.at(-1)?.code).toBe('STATE_SNAPSHOT_CAPTURED');
  });
  it('filters the event history without deleting stored diagnostic events',()=>{
    act(()=>{recordUserAction('ORIGIN_SELECTION_CHANGED','dashboard');recordEvent('error','CSV_EXPORT_FAILED','analytics');});
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const panel=within(screen.getByRole('region',{name:'Application diagnostics'}));
    const history=within(panel.getByLabelText('Recent diagnostic events'));
    fireEvent.change(panel.getByLabelText('Filter log severity'),{target:{value:'error'}});
    expect(history.getByText('CSV_EXPORT_FAILED')).toBeInTheDocument();
    expect(history.queryByText('ORIGIN_SELECTION_CHANGED')).not.toBeInTheDocument();
    expect(getDiagnosticsSnapshot().events.some(e=>e.code==='ORIGIN_SELECTION_CHANGED')).toBe(true);
  });
  it('downloads sanitized diagnostics locally without network requests',()=>{
    const create=vi.fn(()=> 'blob:local-diagnostics');const revoke=vi.fn();
    vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke;});
    vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    fireEvent.click(screen.getByRole('button',{name:'Export diagnostics'}));
    expect(create).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Diagnostics file prepared locally.')).toBeInTheDocument();
  });
  it('recovers from render failures without recording raw exception text',()=>{
    const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
    let fails=true;
    function Bomb(){if(fails)throw new Error('raw ORDER_ID=secret-123');return <span>Recovered chart</span>;}
    render(<UiErrorBoundary area="sankey"><Bomb/></UiErrorBoundary>);
    expect(screen.getByRole('alert')).toHaveTextContent('This dashboard section could not be displayed.');
    expect(getDiagnosticsSnapshot().events.at(-1)?.code).toBe('RENDER_FAILED');
    expect(JSON.stringify(getDiagnosticsSnapshot())).not.toContain('secret-123');
    fails=false;
    fireEvent.click(screen.getByRole('button',{name:'Try this section again'}));
    expect(screen.getByText('Recovered chart')).toBeInTheDocument();
    spy.mockRestore();
  });
  it('turns CSV download errors into user feedback and sanitized diagnostic events',()=>{
    const originalCreate=URL.createObjectURL;
    URL.createObjectURL=vi.fn(()=>{throw new Error('Private order ID leak attempt!');});
    try {
      render(<CsvExportButton cohort={selectCohort(dataset.index,DEFAULT_FILTERS)}/>);
      fireEvent.click(screen.getByRole('button',{name:'Export filtered orders (CSV)'}));
      expect(screen.getByRole('status')).toHaveTextContent('CSV export failed.');
      expect(getDiagnosticsSnapshot().events.at(-1)?.code).toBe('CSV_EXPORT_FAILED');
      expect(JSON.stringify(getDiagnosticsSnapshot())).not.toContain('Private order ID');
    } finally {URL.createObjectURL=originalCreate;}
  });

});
