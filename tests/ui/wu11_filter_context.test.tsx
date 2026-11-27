// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {act,cleanup,fireEvent,render,screen,within} from '@testing-library/react';
import {DashboardContent} from '../../src/app/App';
import {HiddenFilterToast} from '../../src/components/HiddenFilterToast';
import {dataset} from './fixtures';

afterEach(()=>{cleanup();vi.useRealTimers();vi.restoreAllMocks();window.localStorage.clear();window.sessionStorage.clear();});

function openEditor(){return expandWorkspace();}

function selectSeller(){
  const filterPanel=screen.getByRole('button',{name:'Filters & Views'});
  if(filterPanel.getAttribute('aria-expanded')==='false')fireEvent.click(filterPanel);
  fireEvent.click(screen.getByLabelText('Seller origins'));
  fireEvent.click(screen.getByRole('checkbox',{name:'Seller origins: SP · São Paulo'}));
}

function expandWorkspace(){
  const expand=screen.queryByRole('button',{name:'Expand Dashboard Workspace'});
  if(expand) fireEvent.click(expand);
  return within(screen.getByRole('list',{name:'Section order'}));
}

describe('WU-11 Phase 2B persistent filter context and hide-only warnings',()=>{
  it('does not toast when selecting a filter and discloses the exact global cohort context',()=>{
    render(<DashboardContent dataset={dataset}/>);
    selectSeller();
    expect(screen.queryByText('Filters remain active.')).not.toBeInTheDocument();
    const context=within(screen.getByRole('region',{name:'Active dashboard filter context'}));
    const disclosure=context.getByRole('button',{name:/Filters Active/});
    expect(disclosure).toHaveAttribute('aria-expanded','false');
    fireEvent.click(disclosure);
    expect(context.getByText(/Seller origin: SP/)).toBeInTheDocument();
    expect(context.getByRole('button',{name:'Remove seller origin SP'})).toBeInTheDocument();
  });

  it('warns only when hiding the filter panel with active filters; never clears their data',()=>{
    render(<DashboardContent dataset={dataset}/>);
    selectSeller();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    const editor=openEditor();
    fireEvent.click(screen.getByRole('checkbox',{name:'Show full filter panel'}));
    expect(screen.queryByRole('region',{name:'Dashboard filters'})).not.toBeInTheDocument();
    expect(screen.getByText('Filters remain active.')).toBeInTheDocument();
    expect(screen.getByText('Filter controls hidden.')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button',{name:'Show filter controls'}));
    expect(screen.getByRole('region',{name:'Dashboard filters'})).toBeInTheDocument();
    expect(editor.getAllByRole('checkbox').length).toBe(8);
  });

  it('warns when hiding a focused Sankey and keeps that exact directed flow even after it unmounts',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const flows=within(screen.getByRole('group',{name:'Focus a directed seller-to-customer state pair'}));
    fireEvent.click(flows.getByRole('button',{name:/SP.*MG.*1 items/}));
    expect(screen.queryByText('Filters remain active.')).not.toBeInTheDocument();
    const editor=openEditor();
    fireEvent.click(editor.getByRole('checkbox',{name:'Shipping Sankey'}));
    expect(screen.getByText('Sankey hidden.')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
    const context=within(screen.getByRole('region',{name:'Active dashboard filter context'}));
    fireEvent.click(context.getByRole('button',{name:/Filters Active/}));
    expect(context.getByText(/Focused flow: SP → MG/)).toBeInTheDocument();
    expect(context.getByRole('button',{name:'Clear flow focus'})).toBeInTheDocument();
  });

  it('does not warn about hiding an unrelated section or hiding an unfiltered chart',()=>{
    render(<DashboardContent dataset={dataset}/>);
    const editor=openEditor();
    fireEvent.click(editor.getByRole('checkbox',{name:'Shipping Sankey'}));
    expect(screen.queryByText('Filters remain active.')).not.toBeInTheDocument();
    fireEvent.click(editor.getByRole('checkbox',{name:'Geographic distribution'}));
    expect(screen.queryByText('Filters remain active.')).not.toBeInTheDocument();
  });

  it('warns when hiding geography with an active origin selection and restores all controls on reset',()=>{
    render(<DashboardContent dataset={dataset}/>);
    selectSeller();
    const editor=openEditor();
    fireEvent.click(editor.getByRole('checkbox',{name:'Geographic distribution'}));
    expect(screen.getByText(/Geographic distribution hidden/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Show all sections'}));
    expect(screen.queryByText(/Geographic distribution hidden/)).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-indigo')).toHaveTextContent('1');
  });
  it('automatically dismisses the hide-only notice after 4.5 seconds',()=>{
    vi.useFakeTimers();
    const onDismiss=vi.fn();
    render(<HiddenFilterToast notice={{key:1,message:'Sankey hidden.'}} onDismiss={onDismiss}/>);
    act(()=>vi.advanceTimersByTime(4499));
    expect(onDismiss).not.toHaveBeenCalled();
    act(()=>vi.advanceTimersByTime(1));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
