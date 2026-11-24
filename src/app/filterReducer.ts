import { DEFAULT_FILTERS } from '../domain/types';
import type { FilterAction, Filters } from '../domain/types';

function reconcileFocus(state: Filters): Filters {
  const focus = state.focusedFlow;
  if (!focus) return state;
  if ((state.sellerStates.length > 0 && !state.sellerStates.includes(focus.sellerState)) ||
      (state.customerStates.length > 0 && !state.customerStates.includes(focus.customerState))) {
    return {...state, focusedFlow: null};
  }
  return state;
}

/** All context filters and drill-down focus have one explicit transition owner. */
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
      const same = state.focusedFlow?.sellerState === action.sellerState &&
        state.focusedFlow?.customerState === action.customerState;
      // Focus never overwrites multi-select state. An incompatible flow cannot be focused.
      if (state.sellerStates.length && !state.sellerStates.includes(action.sellerState)) return state;
      if (state.customerStates.length && !state.customerStates.includes(action.customerState)) return state;
      return {...state, focusedFlow: same ? null : {sellerState: action.sellerState, customerState: action.customerState}};
    }
    case 'clear_flow_focus':
      return {...state, focusedFlow: null};
    case 'clear_all':
      return {...DEFAULT_FILTERS};
    default:
      return state;
  }
}
