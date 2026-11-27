// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach,describe,expect,it,vi } from 'vitest';
import { cleanup,fireEvent,render,screen,within } from '@testing-library/react';
import { DashboardContent } from '../../src/app/App';
import { DASHBOARD_STORAGE_KEY } from '../../src/domain/dashboardWorkspace';
import { dataset } from './fixtures';

afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks();});
const editor=()=>expandWorkspace();
function newDashboard(name='Executive'){expandWorkspace();fireEvent.click(screen.getByRole('button',{name:'New'}));fireEvent.change(screen.getByRole('textbox',{name:'New dashboard name'}),{target:{value:name}});fireEvent.click(screen.getByRole('button',{name:'Create dashboard'}));}

function expandWorkspace(){
  const expand=screen.queryByRole('button',{name:'Expand Dashboard Workspace'});
  if(expand) fireEvent.click(expand);
  return within(screen.getByRole('list',{name:'Section order'}));
}

describe('WU-11 Phase 3 named dashboards',()=>{
  it('creates a named dashboard from a filtered and hidden current view, then restores on remount',()=>{
    const first=render(<DashboardContent dataset={dataset}/>);
    expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBeNull();
    fireEvent.click(editor().getByRole('checkbox',{name:'Shipping Sankey'}));
    fireEvent.click(screen.getByRole('button',{name:'Collapse Dashboard Workspace'}));
    newDashboard('Logistics');
    const raw=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!);
    expect(raw.dashboards).toHaveLength(1);
    expect(raw.dashboards[0].layout.hiddenSections).toContain('shippingSankey');
    expect(screen.getByRole('combobox',{name:'Current dashboard'})).toHaveValue(raw.dashboards[0].id);
    first.unmount();
    render(<DashboardContent dataset={dataset}/>);
    expect(screen.queryByRole('group',{name:'Sankey measurement'})).not.toBeInTheDocument();
    expect(screen.getByRole('combobox',{name:'Current dashboard'})).toHaveValue(raw.dashboards[0].id);
  });
  it('requires discard or save before switching, and cancel keeps edits',()=>{
    render(<DashboardContent dataset={dataset}/>);
    newDashboard('Routing');
    const customId=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!).activeDashboardId;
    fireEvent.click(editor().getByRole('checkbox',{name:'Geographic distribution'}));
    expect(screen.getByText('Unsaved changes')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox',{name:'Current dashboard'}),{target:{value:'full-dashboard'}});
    const prompt=within(screen.getByRole('group',{name:'Unsaved dashboard changes'}));
    fireEvent.click(prompt.getByRole('button',{name:/Cancel/}));
    expect(screen.getByRole('combobox',{name:'Current dashboard'})).toHaveValue(customId);
    fireEvent.change(screen.getByRole('combobox',{name:'Current dashboard'}),{target:{value:'full-dashboard'}});
    fireEvent.click(within(screen.getByRole('group',{name:'Unsaved dashboard changes'})).getByRole('button',{name:'Discard and switch'}));
    expect(screen.getByRole('combobox',{name:'Current dashboard'})).toHaveValue('full-dashboard');
    const saved=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!).dashboards[0];
    expect(saved.layout.hiddenSections).toEqual([]);
  });
  it('allows a saved dashboard to hide filter controls without clearing its filter context',()=>{
    render(<DashboardContent dataset={dataset}/>);
    newDashboard('Minimal');
    editor();
    fireEvent.click(screen.getByRole('checkbox',{name:'Show full filter panel'}));
    expect(screen.queryByRole('region',{name:'Dashboard filters'})).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Save'}));
    const stored=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!).dashboards[0];
    expect(stored.layout.filterPanelVisible).toBe(false);
    expect(screen.getByRole('button',{name:'Show filter controls'})).toBeInTheDocument();
  });

  it('leaves unsupported stored versions untouched and disables unsafe writes',()=>{
    const raw=JSON.stringify({schemaVersion:99,activeDashboardId:'full-dashboard',dashboards:[]});
    localStorage.setItem(DASHBOARD_STORAGE_KEY,raw);
    render(<DashboardContent dataset={dataset}/>);
    expandWorkspace();
    expect(screen.getByRole('button',{name:'New'})).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent('not been overwritten');
    expect(localStorage.getItem(DASHBOARD_STORAGE_KEY)).toBe(raw);
  });
  it('blocks stale cross-tab updates and offers an explicit reload',()=>{
    render(<DashboardContent dataset={dataset}/>);
    newDashboard('Existing');
    fireEvent(window,new StorageEvent('storage',{key:DASHBOARD_STORAGE_KEY,newValue:'{}'}));
    expect(screen.getByText(/Saved dashboards changed in another tab/)).toBeInTheDocument();
    expandWorkspace();
    expect(screen.getByRole('button',{name:'New'})).toBeDisabled();
    fireEvent.click(screen.getByRole('button',{name:'Reload saved dashboards'}));
    expect(screen.getByRole('button',{name:'New'})).toBeEnabled();
  });
  it('protects Full Dashboard, supports rename and duplicate, and prevents unsafe overwritten storage',()=>{
    render(<DashboardContent dataset={dataset}/>);
    expandWorkspace();
    expect(screen.getByRole('button',{name:'Save'})).toBeDisabled();
    newDashboard('First');
    fireEvent.click(within(screen.getByRole('region',{name:'Dashboard workspace manager'})).getByRole('button',{name:'Rename'}));
    fireEvent.change(screen.getByRole('textbox',{name:'Rename dashboard'}),{target:{value:'Second'}});
    fireEvent.click(screen.getByRole('button',{name:'Save name'}));
    expect(screen.getByRole('combobox',{name:'Current dashboard'})).toHaveTextContent('Second');
    fireEvent.click(screen.getByRole('button',{name:'Duplicate'}));
    const stored=JSON.parse(localStorage.getItem(DASHBOARD_STORAGE_KEY)!);
    expect(stored.dashboards).toHaveLength(2);
    expect(stored.dashboards[1].name).toContain('copy');
  });
});
