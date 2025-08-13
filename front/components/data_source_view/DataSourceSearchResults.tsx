import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import { cn, ScrollableDataTable } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";

import { makeColumnsForSearchResults } from "@app/components/spaces/search/columns";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import type { DataSourceViewContentNode } from "@app/types";
import { isDataSourceViewCategoryWithoutApps } from "@app/types";

// The actual type returned from useSpacesSearch has dataSourceViews array
interface SearchResultNode {
  internalId: string;
  title: string;
  lastUpdatedAt: number;
  mimeType: string;
  expandable: boolean;
  sourceUrl?: string;
  parentInternalIds?: string[];
  dataSourceViews: any[]; // DataSourceViewType[]
}

interface DataSourceSearchResultsProps {
  searchResultNodes: SearchResultNode[];
  isLoading: boolean;
  onClearSearch: () => void;
}

export function DataSourceSearchResults({
  searchResultNodes,
  isLoading,
  onClearSearch,
}: DataSourceSearchResultsProps) {
  const { setCategoryEntry, setDataSourceViewEntry, addNodeEntry } =
    useDataSourceBuilderContext();

  // Process search results for the table
  const searchResults = useMemo(() => {
    const processedResults = searchResultNodes.flatMap((node) => {
      const { dataSourceViews, ...rest } = node;
      return dataSourceViews.map((view) => ({
        ...rest,
        dataSourceView: view,
      }));
    });
    return processedResults;
  }, [searchResultNodes]);

  // Handle search result navigation
  const handleSearchResultClick = useCallback(
    (node: DataSourceViewContentNode) => {
      // Clear search first
      onClearSearch();

      // Navigate to the search result based on its type and location
      if (node.expandable) {
        const { dataSourceView } = node;

        // Only navigate to categories that are allowed in the builder context
        if (isDataSourceViewCategoryWithoutApps(dataSourceView.category)) {
          // Navigate through the hierarchy to reach this node
          if (node.mimeType === DATA_SOURCE_MIME_TYPE) {
            // Navigate to data source level
            setCategoryEntry(dataSourceView.category);
            setDataSourceViewEntry(dataSourceView);
          } else {
            // Navigate to the node level
            setCategoryEntry(dataSourceView.category);
            setDataSourceViewEntry(dataSourceView);
            addNodeEntry(node);
          }
        }
      }
    },
    [onClearSearch, setCategoryEntry, setDataSourceViewEntry, addNodeEntry]
  );

  // Table data for search results
  const searchTableRows = useMemo(() => {
    return searchResults.map((node) => ({
      ...node,
      id: node.internalId,
      icon: getVisualForDataSourceViewContentNode(node),
      location: getLocationForDataSourceViewContentNode(node),
      onClick: node.expandable
        ? () => handleSearchResultClick(node)
        : undefined,
    }));
  }, [searchResults, handleSearchResultClick]);

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="text-end text-sm text-muted-foreground">
        {isLoading ? "Searching..." : `${searchResults.length} results found`}
      </div>
      <ScrollableDataTable
        data={searchTableRows}
        columns={makeColumnsForSearchResults()}
        className={cn("pb-4", isLoading && "pointer-events-none opacity-50")}
        totalRowCount={searchResults.length}
        maxHeight="h-[600px]"
      />
    </div>
  );
}
