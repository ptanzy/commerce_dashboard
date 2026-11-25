// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { DiagnosticsPanel } from '../../src/components/DiagnosticsPanel';
import { UiErrorBoundary } from '../../src/observability/UiErrorBoundary';
import { recordEvent, resetDiagnosticsForTests, updateDashboardState, getDiagnosticsSnapshot } from '../../src/observability/diagnostics';
import { getRecoverySnapshot, registerRecoveryHandler, resetRecoveryForTests } from '../../src/observability/recovery';

beforeEach(()=>{resetRecoveryForTests();resetDiagnosticsForTests();});
afterEach(()=>{cleanup();resetRecoveryForTests();resetDiagnosticsForTests();vi.restoreAllMocks();});

describe('WU-08 recovery center',()=>{
  it('does not treat a valid empty cohort as a software error',()=>{
    act(()=>updateDashboardState({origins:2,destinations:1,categories:0,focusedFlows:0,dateFiltered:false,eligibleOrders:0}));
    render(<DiagnosticsPanel/>);
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    expect(within(screen.getByLabelText('Diagnostic recovery center')).getByText(/No unresolved known issues/)).toBeInTheDocument();
  });
  it('runs only a registered recovery and reports verified success',async()=>{
    const retry=vi.fn(()=>true);
    const stop=registerRecoveryHandler('csv','retry',retry);
    try {
      act(()=>recordEvent('error','CSV_EXPORT_FAILED','analytics'));
      render(<DiagnosticsPanel/>);
      fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
      const center=within(screen.getByLabelText('Diagnostic recovery center'));
      expect(center.getByText('CSV download failed')).toBeInTheDocument();
      fireEvent.click(center.getByRole('button',{name:'Retry and verify'}));
      await waitFor(()=>expect(center.getByText(/CSV download was initiated/)).toBeInTheDocument());
      expect(retry).toHaveBeenCalledTimes(1);
      expect(getRecoverySnapshot().attempts.at(-1)?.outcome).toBe('verified');
      expect(getDiagnosticsSnapshot().recoveryAttempts.at(-1)?.kind).toBe('csv');
    } finally{stop();}
  });
  it('isolates a failed section without mutating filter state, then restores it',async()=>{
    const spy=vi.spyOn(console,'error').mockImplementation(()=>{});
    let broken=true;
    function Chart(){if(broken)throw Error('private record data');return <p>Recovered chart view</p>;}
    act(()=>updateDashboardState({origins:3,destinations:4,categories:1,focusedFlows:2,dateFiltered:true,eligibleOrders:15}));
    render(<><DiagnosticsPanel/><UiErrorBoundary area="sankey"><Chart/></UiErrorBoundary></>);
    expect(screen.getByRole('alert')).toHaveTextContent('could not be displayed');
    fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
    const center=within(screen.getByLabelText('Diagnostic recovery center'));
    fireEvent.click(center.getByRole('button',{name:'Continue without section'}));
    await waitFor(()=>expect(screen.getByText('This section is temporarily isolated.')).toBeInTheDocument());
    expect(getDiagnosticsSnapshot().currentState?.eligibleOrders).toBe(15);
    expect(getRecoverySnapshot().isolated).toContain('sankey');
    broken=false;
    fireEvent.click(center.getByRole('button',{name:'Restore section'}));
    await waitFor(()=>expect(screen.getByText('Recovered chart view')).toBeInTheDocument());
    expect(getRecoverySnapshot().isolated).not.toContain('sankey');
    expect(JSON.stringify(getDiagnosticsSnapshot())).not.toContain('private record data');
    spy.mockRestore();
  });
});
