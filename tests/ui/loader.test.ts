// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { loadDashboardData } from '../../src/data/loader';
import { orders,items,manifest } from './fixtures';

function fakeResponse(data:unknown,ok=true,status=200): Response {
  return {ok,status,json:async()=>data} as Response;
}

describe('static asset loading',()=>{
  it('validates source schema and preserves its item index',async()=>{
    const seen:string[]=[];
    const fetcher=async(path:string)=>{
      seen.push(path);
      if(path.endsWith('orders.json'))return fakeResponse(orders);
      if(path.endsWith('items.json'))return fakeResponse(items);
      return fakeResponse(manifest);
    };
    const dataset=await loadDashboardData(new AbortController().signal,fetcher);
    expect(dataset.manifest.orderCount).toBe(3);
    expect(dataset.index.itemsByOrderId.get('multi')).toHaveLength(2);
    expect(seen).toHaveLength(3);
    expect(seen.every(p=>p.includes('/data/'))).toBe(true);
  });
  it('provides actionable missing-file errors',async()=>{
    const fetcher=async()=>fakeResponse({},false,404);
    await expect(loadDashboardData(new AbortController().signal,fetcher)).rejects.toThrow(/Run the Python data-preparation command/);
  });
  it('rejects a corrupted manifest before analytics run',async()=>{
    const fetcher=async(path:string)=>{
      if(path.endsWith('orders.json'))return fakeResponse(orders);
      if(path.endsWith('items.json'))return fakeResponse(items);
      return fakeResponse({...manifest,orderCount:4});
    };
    await expect(loadDashboardData(new AbortController().signal,fetcher)).rejects.toThrow(/order count mismatch/);
  });
});
