import { DEFAULT_FILTERS } from '../domain/types';
import type { FilterAction, Filters, FlowPair } from '../domain/types';

export const sameFlow = (a: FlowPair,b: FlowPair) => a.sellerState === b.sellerState && a.customerState === b.customerState;

/** Discard ONLY incompatible pairs when global dimensions are narrowed. */
function reconcileFocus(state: Filters): Filters {
  const focusedFlows = state.focusedFlows.filter(pair =>
    (!state.sellerStates.length || state.sellerStates.includes(pair.sellerState)) &&
    (!state.customerStates.length || state.customerStates.includes(pair.customerState)));
  return focusedFlows.length === state.focusedFlows.length ? state : {...state,focusedFlows};
}

function compatible(state: Filters, pair: FlowPair): boolean {
  return (!state.sellerStates.length || state.sellerStates.includes(pair.sellerState)) &&
    (!state.customerStates.length || state.customerStates.includes(pair.customerState));
}

function deduplicate(pairs: readonly FlowPair[]): FlowPair[] {
  const seen=new Set<string>();
  const result:FlowPair[]=[];
  for(const pair of pairs) {
    const key=`${pair.sellerState}\u0000${pair.customerState}`;
    if (!seen.has(key)) {seen.add(key);result.push({...pair});}
  }
  return result;
}

export function filterReducer(state: Filters, action: FilterAction): Filters {
  switch (action.type) {
    case 'set_date_range':
      return {...state, purchaseDateFrom: action.from, purchaseDateTo: action.to};
    case 'toggle_value': {
      const existing = state[action.dimension];
      const selected = existing.includes(action.value)
        ? existing.filter(value => value !== action.value)
        : [...existing, action.value].sort((a,b) => a.localeCompare(b));
      return reconcileFocus({...state, [action.dimension]: selected});
    }
    case 'clear_dimension':
      return {...state, [action.dimension]: []};
    case 'focus_flow': {
      const pair={sellerState:action.sellerState,customerState:action.customerState};
      if(!compatible(state,pair)) return state;
      return {...state, focusedFlows:state.focusedFlows.length===1 && sameFlow(state.focusedFlows[0],pair)?[]:[pair]};
    }
    case 'toggle_flow_focus': {
      const pair={sellerState:action.sellerState,customerState:action.customerState};
      if(!compatible(state,pair)) return state;
      const included=state.focusedFlows.some(x=>sameFlow(x,pair));
      return {...state,focusedFlows:included?state.focusedFlows.filter(x=>!sameFlow(x,pair)):[...state.focusedFlows,pair]};
    }
    case 'restore_filters':
      return reconcileFocus({...action.filters,
        customerStates:[...action.filters.customerStates],sellerStates:[...action.filters.sellerStates],
        categories:[...action.filters.categories],focusedFlows:deduplicate(action.filters.focusedFlows)});
    case 'clear_flow_focus':
      return {...state, focusedFlows: []};
    case 'clear_all':
      return {...DEFAULT_FILTERS};
    default:
      return state;
  }
}
