import type { DataSourceViewType } from "@dust-tt/types";
import { createContext } from "react";

// Temporary context to share the search term between the SpaceLayout and the
// descendants. Will be removed once the keyword search is implemented.
// TODO(20250226, search-kb): remove this once the keyword search is implemented.
// Create a context with both search state and action buttons
export interface SpaceSearchContextType {
  // Search state.
  searchTerm?: string;
  setSearchTerm?: (value: string) => void;

  isSearchDisabled: boolean;
  setIsSearchDisabled: (value: boolean) => void;

  // Data source view targeting for search
  targetDataSourceViews?: DataSourceViewType[];
  setTargetDataSourceViews: (value: DataSourceViewType[]) => void;
}

export const SpaceSearchContext = createContext<SpaceSearchContextType>({
  searchTerm: "",
  setSearchTerm: () => {},

  isSearchDisabled: false,
  setIsSearchDisabled: () => {},

  targetDataSourceViews: [],
  setTargetDataSourceViews: () => {},
});
