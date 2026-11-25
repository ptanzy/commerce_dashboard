import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { recordEvent } from './diagnostics';
import type { DiagnosticArea } from './diagnostics';
import {
  deriveRecoveryIssues, isSectionIsolated, registerRecoveryHandler, runRecovery,
} from './recovery';
import { getDiagnosticsSnapshot } from './diagnostics';

interface Props { children:ReactNode; area:DiagnosticArea; }
interface State { failed:boolean; isolated:boolean; }
/** Catches React render/lifecycle errors. Retry and isolation never alter filter state. */
export class UiErrorBoundary extends Component<Props,State> {
  state:State={failed:false,isolated:isSectionIsolated(this.props.area)};
  private cleanups:Array<()=>void>=[];
  private pendingVerify:((ok:boolean)=>void)|null=null;
  static getDerivedStateFromError():Partial<State> {return {failed:true};}
  componentDidMount():void {
    const area=this.props.area;
    if(area==='app'||area==='dashboard')return;
    this.cleanups=[
      registerRecoveryHandler(area,'retry',()=>this.retry()),
      registerRecoveryHandler(area,'restore',()=>this.retry()),
      registerRecoveryHandler(area,'isolate',()=>this.isolate()),
    ];
  }
  componentWillUnmount():void {
    this.cleanups.forEach(fn=>fn());this.cleanups=[];
    this.pendingVerify?.(false);this.pendingVerify=null;
  }
  componentDidCatch(_error:Error,_info:ErrorInfo):void {
    // Exceptions, stacks and component tree are not persisted.
    recordEvent('fatal','RENDER_FAILED',this.props.area);
    this.pendingVerify?.(false);this.pendingVerify=null;
  }
  componentDidUpdate(_prevProps:Props,prev:State):void {
    if((prev.failed||prev.isolated)&&!this.state.failed&&!this.state.isolated){
      this.pendingVerify?.(true);this.pendingVerify=null;
    }
  }
  private retry=():Promise<boolean>=>new Promise(resolve=>{
    this.pendingVerify=resolve;
    this.setState({failed:false,isolated:false},()=>{
      // An already healthy section needs no remount; a failed section resolves in componentDidUpdate.
      if(!this.state.failed&&!this.state.isolated&&this.pendingVerify){this.pendingVerify(true);this.pendingVerify=null;}
    });
  });
  private isolate=():Promise<boolean>=>new Promise(resolve=>{
    this.pendingVerify?.(false);this.pendingVerify=null;
    this.setState({failed:false,isolated:true},()=>resolve(this.state.isolated));
  });
  private attempt=(action:'retry'|'isolate'|'restore')=>{
    const issue=deriveRecoveryIssues(getDiagnosticsSnapshot()).find(i=>i.kind==='render'&&i.area===this.props.area);
    if(issue&&issue.target)void runRecovery(issue,action);
    else if(action==='restore'||action==='retry')void this.retry();
  };
  render():ReactNode {
    if(this.state.isolated)return <section className="diagnostic-recovery" role="status">
      <strong>This section is temporarily isolated.</strong>
      <p>Other dashboard views remain available. Filters and saved views were not changed.</p>
      <button type="button" onClick={()=>this.attempt('restore')}>Restore section</button>
    </section>;
    if(!this.state.failed)return this.props.children;
    return <section className="diagnostic-recovery" role="alert">
      <strong>{this.props.area==='app'?'The dashboard encountered an unexpected error.':'This dashboard section could not be displayed.'}</strong>
      <p>The failure was recorded locally without saving source records. Open Diagnostics for guided recovery.</p>
      <button type="button" onClick={()=>this.attempt('retry')}>Try this section again</button>
      {this.props.area!=='app'&&this.props.area!=='dashboard'?<button type="button" onClick={()=>this.attempt('isolate')}>Continue without this section</button>:null}
      <button type="button" onClick={()=>window.location.reload()}>Reload dashboard</button>
    </section>;
  }
}
