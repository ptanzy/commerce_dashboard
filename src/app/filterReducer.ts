import { DEFAULT_FILTERS } from '../domain/types';
import type { FilterAction, Filters } from '../domain/types';

/** Sole owner of cohort filter transitions; no chart-specific hidden filters. */
export function filterReducer(state: Filters, action: FilterAction): Filters {
  switch (action.type) {
    case 'set_date_range':
      return { ...state, purchaseDateFrom: action.from, purchaseDateTo: action.to };
    case 'set_customer_state':
      return { ...state, customerState: action.state };
    case 'set_seller_state':
      return { ...state, sellerState: action.state };
    case 'set_category':
      return { ...state, category: action.category };
    case 'set_flow_pair':
      return { ...state, sellerState: action.sellerState, customerState: action.customerState };
    case 'clear_all':
      return { ...DEFAULT_FILTERS };
    default:
      return state;
  }
}
