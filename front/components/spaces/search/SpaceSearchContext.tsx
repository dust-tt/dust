import type { DataSourceViewType } from "@app/types/data_source_view";
import type { ReactNode } from "react";
import { createContext } from "react";

// Temporary context to share the search term between the SpaceLayout and the
// descendants. Will be removed once the keyword search is implemented.
// TODO(20250226, search-kb): remove this once the keyword search is implemented.
// Create a context with both search state and action buttons
export interface SpaceSearchContextType {
  isSearchDisabled: boolean;
  setIsSearchDisabled: (value: boolean) => void;

  // Data source view targeting for search
  targetDataSourceViews?: DataSourceViewType[];
  setTargetDataSourceViews: (value: DataSourceViewType[]) => void;

  setActionButtons?: (buttons: ReactNode | null) => void;
  actionButtons?: ReactNode | null;

  /**
   * Immediate search string for frontend-only space lists (actions, triggers, apps).
   * URL `q` can lag behind shallow routing; lists should prefer this when set.
   */
  frontendListFilterQuery?: string;
}

export const SpaceSearchContext = createContext<SpaceSearchContextType>({
  isSearchDisabled: false,
  setIsSearchDisabled: () => {},

  targetDataSourceViews: [],
  setTargetDataSourceViews: () => {},

  frontendListFilterQuery: undefined,
});
