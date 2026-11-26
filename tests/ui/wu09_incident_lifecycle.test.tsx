// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { DiagnosticsPanel } from '../../src/components/DiagnosticsPanel';
import { recordEvent, resetDiagnosticsForTests } from '../../src/observability/diagnostics';
import { resetRecoveryForTests } from '../../src/observability/recovery';

const region=()=>within(screen.getByRole('region',{name:'Developer incident investigation'}));
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-25T12:00:00.000Z'));
  resetRecoveryForTests();resetDiagnosticsForTests();
});
afterEach(()=>{
  cleanup();resetRecoveryForTests();resetDiagnosticsForTests();vi.useRealTimers();vi.restoreAllMocks();
});
function openPanel(){
  render(<DiagnosticsPanel/>);
  fireEvent.click(screen.getByRole('button',{name:/Diagnostics/}));
}
describe('WU-09 incident recovery lifecycle',()=>{
  it('starts compact with zero active incidents and offers a manual disclosure',()=>{
    openPanel();
    expect(region().getByRole('button',{name:'Expand developer incident investigation'})).toHaveAttribute('aria-expanded','false');
    expect(region().getByText('No active incidents')).toBeInTheDocument();
    fireEvent.click(region().getByRole('button',{name:'Expand developer incident investigation'}));
    expect(region().getByRole('button',{name:'Active (0)'})).toBeVisible();
  });
  it('observes recovery, archives only after 60 seconds, and exposes history from compact state',()=>{
    act(()=>recordEvent('error','GEOGRAPHY_LOAD_FAILED','map'));
    openPanel();
    expect(region().getByRole('combobox',{name:'Choose incident to investigate'})).toHaveValue('GEOGRAPHY_LOAD_FAILED:map');
    act(()=>recordEvent('info','GEOGRAPHY_LOADED','map'));
    fireEvent.click(region().getByRole('button',{name:'Investigate and check health'}));
    expect(region().getByText('recovery observed')).toBeInTheDocument();
    act(()=>vi.advanceTimersByTime(59_999));
    expect(region().getByRole('button',{name:'Collapse developer incident investigation'})).toBeVisible();
    act(()=>vi.advanceTimersByTime(1));
    expect(region().getByRole('button',{name:'Expand developer incident investigation'})).toHaveAttribute('aria-expanded','false');
    fireEvent.click(region().getByRole('button',{name:'View recovered incident history (1)'}));
    expect(region().getByRole('combobox',{name:'Choose incident to investigate'})).toBeVisible();
    fireEvent.click(region().getByRole('button',{name:'Investigate and check health'}));
    expect(region().getByText('recovered')).toBeInTheDocument();
    expect(region().getByText(/Root cause not confirmed/)).toBeVisible();
  });
  it('preserves explicit expansion across automatic archival',()=>{
    act(()=>recordEvent('error','GEOGRAPHY_LOAD_FAILED','map'));
    openPanel();
    fireEvent.click(region().getByRole('button',{name:'Collapse developer incident investigation'}));
    fireEvent.click(region().getByRole('button',{name:'Expand developer incident investigation'}));
    act(()=>recordEvent('info','GEOGRAPHY_LOADED','map'));
    act(()=>vi.advanceTimersByTime(60_000));
    expect(region().getByRole('button',{name:'Collapse developer incident investigation'})).toHaveAttribute('aria-expanded','true');
    expect(region().getByText('No active incidents.')).toBeVisible();
  });
  it('a failure during grace cancels archival and repeated failures are counted once',()=>{
    act(()=>recordEvent('error','GEOGRAPHY_LOAD_FAILED','map'));
    openPanel();
    act(()=>recordEvent('info','GEOGRAPHY_LOADED','map'));
    act(()=>vi.advanceTimersByTime(40_000));
    act(()=>recordEvent('error','GEOGRAPHY_LOAD_FAILED','map'));
    act(()=>vi.advanceTimersByTime(60_000));
    expect(region().getByRole('combobox',{name:'Choose incident to investigate'})).toHaveValue('GEOGRAPHY_LOAD_FAILED:map');
    expect(region().getByRole('option',{name:/GEOGRAPHY_LOAD_FAILED \(2\)/})).toBeInTheDocument();
  });
});
