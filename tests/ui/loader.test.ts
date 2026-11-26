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
      if(path.endsWith('current.json'))return fakeResponse(null,false,404);
      if(path.endsWith('orders.json'))return fakeResponse(orders);
      if(path.endsWith('items.json'))return fakeResponse(items);
      return fakeResponse(manifest);
    };
    const dataset=await loadDashboardData(new AbortController().signal,fetcher);
    expect(dataset.manifest.orderCount).toBe(3);
    expect(dataset.index.itemsByOrderId.get('multi')).toHaveLength(2);
    expect(seen).toHaveLength(4);
    expect(seen.every(p=>p.includes('/data/'))).toBe(true);
  });
  it('sends Accept: application/json so Vite returns 404 instead of HTML for a missing optional pointer',async()=>{
    const seen:string[]=[];
    const fetcher=async(path:string,init?:RequestInit):Promise<Response>=>{
      const accept=new Headers(init?.headers).get('Accept');
      expect(accept).toBe('application/json');
      seen.push(path);
      // Vite would otherwise return its index.html (HTTP 200) for current.json.
      if(path.endsWith('current.json'))return fakeResponse(null,false,404);
      if(path.endsWith('orders.json'))return fakeResponse(orders);
      if(path.endsWith('items.json'))return fakeResponse(items);
      return fakeResponse(manifest);
    };
    const dataset=await loadDashboardData(new AbortController().signal,fetcher);
    expect(dataset.manifest.orderCount).toBe(3);
    expect(seen).toHaveLength(4);
    expect(seen.slice(1).every(path=>!path.includes('/generations/'))).toBe(true);
  });
  it('reports a clear error if a proxy still responds with HTML for the publication pointer',async()=>{
    const html=async():Promise<Response>=>({
      ok:true,status:200,
      json:async()=>{throw new SyntaxError(`Unexpected token '<'`);},
    } as Response);
    await expect(loadDashboardData(new AbortController().signal,html)).rejects.toThrow(/publication pointer is not valid JSON/);
  });
  it('loads all assets from the same published generation',async()=>{
    const id='a'.repeat(32);
    const seen:string[]=[];
    const fetcher=async(path:string)=>{
      seen.push(path);
      if(path.endsWith('current.json'))return fakeResponse({formatVersion:1,generation:id,sha256:Object.fromEntries(['metadata.json','orders.json','items.json'].map(x=>[x,'b'.repeat(64)]))});
      if(path.endsWith('orders.json'))return fakeResponse(orders);
      if(path.endsWith('items.json'))return fakeResponse(items);
      return fakeResponse(manifest);
    };
    const result=await loadDashboardData(new AbortController().signal,fetcher);
    expect(result.manifest.orderCount).toBe(3);
    expect(seen.slice(1)).toEqual(['metadata.json','orders.json','items.json'].map(name=>expect.stringContaining(`/generations/${id}/${name}`)));
  });
  it('fails closed for malformed or inaccessible publication pointers',async()=>{
    const invalid=async()=>fakeResponse({formatVersion:1,generation:'../escape',sha256:{}});
    await expect(loadDashboardData(new AbortController().signal,invalid)).rejects.toThrow(/pointer is invalid/);
    const failure=async()=>fakeResponse({},false,503);
    await expect(loadDashboardData(new AbortController().signal,failure)).rejects.toThrow(/publication pointer/);
  });
  it('provides actionable missing-file errors',async()=>{
    const fetcher=async()=>fakeResponse({},false,404);
    await expect(loadDashboardData(new AbortController().signal,fetcher)).rejects.toThrow(/Run the Python data-preparation command/);
  });
  it('rejects a corrupted manifest before analytics run',async()=>{
    const fetcher=async(path:string)=>{
      if(path.endsWith('current.json'))return fakeResponse(null,false,404);
      if(path.endsWith('orders.json'))return fakeResponse(orders);
      if(path.endsWith('items.json'))return fakeResponse(items);
      return fakeResponse({...manifest,orderCount:4});
    };
    await expect(loadDashboardData(new AbortController().signal,fetcher)).rejects.toThrow(/order count mismatch/);
  });
});
