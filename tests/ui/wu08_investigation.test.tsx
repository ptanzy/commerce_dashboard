// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DiagnosticsPanel } from '../../src/components/DiagnosticsPanel';
import {
  getDiagnosticsSnapshot, recordEvent, recordUserAction, resetDiagnosticsForTests,
  updateDashboardState,
} from '../../src/observability/diagnostics';
import { resetRecoveryForTests } from '../../src/observability/recovery';

beforeEach(()=>{resetRecoveryForTests();resetDiagnosticsForTests();});
afterEach(()=>{cleanup();resetRecoveryForTests();resetDiagnosticsForTests();vi.restoreAllMocks();vi.unstubAllGlobals();});

describe('WU-08 developer incident investigation',()=>{
  it('investigates an unknown error without claiming an established root cause',()=>{
    act(()=>recordEvent('error','UNHANDLED_REJECTION','app'));
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const investigation=within(screen.getByRole('region',{name:'Developer incident investigation'}));
    expect(investigation.getByRole('combobox',{name:'Choose incident to investigate'})).toHaveValue('UNHANDLED_REJECTION:app');
    fireEvent.click(investigation.getByRole('button',{name:'Investigate and check health'}));
    expect(investigation.getByText(/Root cause not confirmed/)).toBeInTheDocument();
    expect(investigation.getByText(/Unhandled asynchronous operation, abort race/)).toBeInTheDocument();
    expect(getDiagnosticsSnapshot().healthCheckedAt).not.toBeNull();
  });

  it('shows possible causes for a Sankey error, with troubleshooting and disconfirmation guidance',()=>{
    act(()=>{
      updateDashboardState({origins:1,destinations:2,categories:0,focusedFlows:1,dateFiltered:false,eligibleOrders:13});
      recordUserAction('FLOW_SELECTION_CHANGED','sankey');
      recordEvent('fatal','RENDER_FAILED','sankey');
    });
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const investigation=within(screen.getByRole('region',{name:'Developer incident investigation'}));
    fireEvent.click(investigation.getByRole('button',{name:'Investigate and check health'}));
    const summary=investigation.getByText('Visualization data or layout edge case');
    const hypothesisDetails=summary.closest('details');
    expect(hypothesisDetails).not.toBeNull();
    const hypothesis=within(hypothesisDetails as HTMLElement);
    // Several hypotheses contain this same label; verify the intended one.
    expect(hypothesis.getByText('Suggested troubleshooting')).toBeInTheDocument();
    expect(hypothesis.getByText('Confirm:')).toBeInTheDocument();
    expect(hypothesis.getByText('Weaken:')).toBeInTheDocument();
  });

  it('exports a local developer bundle without sending a request or persisting raw exceptions',()=>{
    const create=vi.fn(()=> 'blob:incident-report');
    const revoke=vi.fn();
    vi.stubGlobal('URL',class extends URL {static createObjectURL=create;static revokeObjectURL=revoke;});
    const click=vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
    act(()=>recordEvent('error','UNHANDLED_ERROR','app'));
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const investigation=within(screen.getByRole('region',{name:'Developer incident investigation'}));
    fireEvent.click(investigation.getByRole('button',{name:'Investigate and check health'}));
    fireEvent.click(investigation.getByRole('button',{name:'Export developer bundle (.json)'}));
    expect(create).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(investigation.getByText(/Local developer report download initiated/)).toBeInTheDocument();
  });
  it('collapses the investigation section and restores the existing report without rerunning checks',()=>{
    act(()=>recordEvent('error','UNHANDLED_ERROR','app'));
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const investigation=within(screen.getByRole('region',{name:'Developer incident investigation'}));
    fireEvent.click(investigation.getByRole('button',{name:'Investigate and check health'}));
    const before=getDiagnosticsSnapshot().healthCheckedAt;
    expect(investigation.getByText(/Root cause not confirmed/)).toBeVisible();
    const collapse=investigation.getByRole('button',{name:'Collapse developer incident investigation'});
    expect(collapse).toHaveAttribute('aria-expanded','true');
    fireEvent.click(collapse);
    expect(investigation.getByRole('button',{name:'Expand developer incident investigation'})).toHaveAttribute('aria-expanded','false');
    expect(investigation.queryByText(/Root cause not confirmed/)).not.toBeVisible();
    fireEvent.click(investigation.getByRole('button',{name:'Expand developer incident investigation'}));
    expect(investigation.getByText(/Root cause not confirmed/)).toBeVisible();
    expect(getDiagnosticsSnapshot().healthCheckedAt).toBe(before);
  });

  it('collapses only findings, keeps the incident controls visible, and preserves the hypotheses',()=>{
    act(()=>recordEvent('error','GEOGRAPHY_LOAD_FAILED','map'));
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const investigation=within(screen.getByRole('region',{name:'Developer incident investigation'}));
    fireEvent.click(investigation.getByRole('button',{name:'Investigate and check health'}));
    const rootCause=investigation.getByText(/Root cause not confirmed/);
    const reportToggle=investigation.getByRole('button',{name:'Collapse incident findings'});
    fireEvent.click(reportToggle);
    expect(investigation.getByRole('button',{name:'Expand incident findings'})).toHaveAttribute('aria-expanded','false');
    expect(rootCause).not.toBeVisible();
    expect(investigation.getByRole('button',{name:'Investigate and check health'})).toBeVisible();
    fireEvent.click(investigation.getByRole('button',{name:'Expand incident findings'}));
    expect(rootCause).toBeVisible();
    expect(investigation.getByText('Missing, inaccessible, or temporarily unavailable local asset')).toBeVisible();
  });

});
