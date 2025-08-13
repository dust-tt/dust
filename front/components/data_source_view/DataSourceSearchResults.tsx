import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import { Checkbox, cn, DataTable, ScrollableDataTable, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import type { DataSourceContentNode } from "@app/lib/api/search";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { DataSourceViewContentNode } from "@app/types";
import { isDataSourceViewCategoryWithoutApps } from "@app/types";

interface DataSourceSearchResultsProps {
  searchResultNodes: DataSourceContentNode[];
  isLoading: boolean;
  onClearSearch: () => void;
  error?: Error | null;
}

interface SearchResultRowData extends DataSourceViewContentNode {
  id: string;
  icon: React.ComponentType;
  location: string;
  entry: NavigationHistoryEntryType;
  onClick?: () => void;
}

function makeSearchResultColumnsWithSelection(
  isRowSelected: (rowId: string) => boolean | "partial",
  selectNode: (entry: NavigationHistoryEntryType) => void,
  removeNode: (entry: NavigationHistoryEntryType) => void
): ColumnDef<SearchResultRowData, any>[] {
  return [
    {
      id: "selection",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const selectionState = isRowSelected(row.original.id);

        return (
          <div className="flex h-full items-center">
            <Checkbox
              checked={selectionState}
              onCheckedChange={(state) => {
                if (selectionState === "partial" || state) {
                  selectNode(row.original.entry);
                } else {
                  removeNode(row.original.entry);
                }
              }}
            />
          </div>
        );
      },
    },
    {
      header: "Name",
      accessorKey: "title",
      id: "title",
      enableSorting: false,
      cell: ({ row }) => (
        <DataTable.CellContent icon={row.original.icon}>
          <Tooltip
            label={row.original.title}
            trigger={<span>{row.original.title}</span>}
          />
        </DataTable.CellContent>
      ),
      meta: {
        sizeRatio: 40,
      },
    },
    {
      header: "Location",
      accessorKey: "location",
      id: "location",
      enableSorting: false,
      cell: ({ row }) => (
        <DataTable.BasicCellContent
          label={
            row.original.dataSourceView.category === "folder"
              ? row.original.dataSourceView.dataSource.name
              : row.original.location
          }
          className="pr-2"
        />
      ),
      meta: {
        sizeRatio: 40,
      },
    },
    {
      header: "Last updated",
      id: "lastUpdatedAt",
      accessorKey: "lastUpdatedAt",
      enableSorting: false,
      cell: ({ row }) => (
        <DataTable.BasicCellContent
          className="justify-end"
          label={
            row.original.lastUpdatedAt
              ? formatTimestampToFriendlyDate(
                  row.original.lastUpdatedAt,
                  "short"
                )
              : "-"
          }
        />
      ),
      meta: {
        sizeRatio: 20,
      },
    },
  ];
}

export function DataSourceSearchResults({
  searchResultNodes,
  isLoading,
  onClearSearch,
  error,
}: DataSourceSearchResultsProps) {
  const {
    setCategoryEntry,
    setDataSourceViewEntry,
    addNodeEntry,
    selectNode,
    removeNode,
    isRowSelected,
  } = useDataSourceBuilderContext();

  // Process search results for the table
  // Convert DataSourceContentNode[] to DataSourceViewContentNode[]
  const searchResults = useMemo((): DataSourceViewContentNode[] => {
    return searchResultNodes.flatMap((node) => {
      const { dataSource, dataSourceViews, ...contentNodeData } = node;
      
      // Create a DataSourceViewContentNode for each dataSourceView
      return dataSourceViews.map((view) => ({
        ...contentNodeData,
        dataSourceView: view,
      }));
    });
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

  // Create navigation entry for each search result
  const createNavigationEntry = (
    node: DataSourceViewContentNode
  ): NavigationHistoryEntryType => {
    if (node.mimeType === DATA_SOURCE_MIME_TYPE) {
      return {
        type: "data_source",
        dataSourceView: node.dataSourceView,
      };
    } else {
      return {
        type: "node",
        node: node,
      };
    }
  };

  // Table data for search results with navigation entries
  const searchTableRows = useMemo((): SearchResultRowData[] => {
    return searchResults.map((node) => ({
      ...node,
      id: node.internalId,
      icon: getVisualForDataSourceViewContentNode(node),
      location: getLocationForDataSourceViewContentNode(node),
      entry: createNavigationEntry(node),
      onClick: node.expandable
        ? () => handleSearchResultClick(node)
        : undefined,
    }));
  }, [searchResults, handleSearchResultClick]);

  // Create columns with selection functionality - memoized
  const columns = useMemo(
    () =>
      makeSearchResultColumnsWithSelection(
        isRowSelected,
        selectNode,
        removeNode
      ),
    [isRowSelected, selectNode, removeNode]
  );

  // Handle error state
  if (error) {
    return (
      <div className="flex w-full flex-col gap-2">
        <div className="text-end text-sm text-muted-foreground">
          Search failed
        </div>
        <div className="flex items-center justify-center p-8 text-center">
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Unable to search at this time. Please try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-primary hover:underline"
            >
              Refresh page
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Handle empty results
  if (!isLoading && searchResults.length === 0) {
    return (
      <div className="flex w-full flex-col gap-2">
        <div className="text-end text-sm text-muted-foreground">
          0 results found
        </div>
        <div className="flex items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No matching results found. Try different search terms.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="text-end text-sm text-muted-foreground">
        {isLoading ? "Searching..." : `${searchResults.length} results found`}
      </div>
      <ScrollableDataTable
        data={searchTableRows}
        columns={columns}
        className={cn("pb-4", isLoading && "pointer-events-none opacity-50")}
        totalRowCount={searchResults.length}
        maxHeight="h-[600px]"
      />
    </div>
  );
}
