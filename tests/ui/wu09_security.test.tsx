// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach, describe, expect, it} from 'vitest';
import {cleanup, fireEvent, render, screen, waitFor} from '@testing-library/react';
import {SavedViews} from '../../src/components/SavedViews';
import {SAVED_VIEWS_KEY} from '../../src/domain/savedViews';
import {DEFAULT_FILTERS} from '../../src/domain/types';
import {getDiagnosticsSnapshot, resetDiagnosticsForTests} from '../../src/observability/diagnostics';

afterEach(()=>{cleanup();window.localStorage.clear();resetDiagnosticsForTests();});

describe('WU-09 saved-view browser security',()=>{
  it('renders an attacker-controlled view name as inert text, never as HTML',()=>{
    const payload='<img src=x onerror="alert(1)">';
    render(<SavedViews filters={DEFAULT_FILTERS} dispatch={()=>{}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'Saved view name'}),{target:{value:payload}});
    fireEvent.click(screen.getByRole('button',{name:'Save new'}));
    expect(screen.getByRole('option',{name:payload})).toBeInTheDocument();
    expect(document.querySelector('img')).toBeNull();
    const parsed=JSON.parse(window.localStorage.getItem(SAVED_VIEWS_KEY) ?? '[]');
    expect(parsed[0].name).toBe(payload);
  });

  it('rejects excessive stored view bytes without parsing or displaying injected names',async()=>{
    window.localStorage.setItem(SAVED_VIEWS_KEY,'x'.repeat(512_100));
    render(<SavedViews filters={DEFAULT_FILTERS} dispatch={()=>{}}/>);
    expect(screen.getByText(/0\/12/)).toBeInTheDocument();
    await waitFor(()=>expect(getDiagnosticsSnapshot().health.browser_storage).toBe('degraded'));
    expect(getDiagnosticsSnapshot().events.some(e=>e.code==='STORAGE_READ_FAILED')).toBe(true);
  });

  it('refuses control and bidi characters in user-entered saved-view names',()=>{
    render(<SavedViews filters={DEFAULT_FILTERS} dispatch={()=>{}}/>);
    fireEvent.change(screen.getByRole('textbox',{name:'Saved view name'}),{target:{value:'Visual \u202E spoof'}});
    fireEvent.click(screen.getByRole('button',{name:'Save new'}));
    expect(screen.getByRole('status')).toHaveTextContent('printable characters');
    expect(window.localStorage.getItem(SAVED_VIEWS_KEY)).toBeNull();
  });
});
