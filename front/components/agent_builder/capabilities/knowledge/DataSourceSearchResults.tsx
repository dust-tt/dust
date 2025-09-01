import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import {
  Checkbox,
  cn,
  DataTable,
  ScrollableDataTable,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useSourcesFormController } from "@app/components/agent_builder/utils";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  addNodeToTree,
  isNodeSelected,
  navigationHistoryEntryTitle,
  pathToString,
  removeNodeFromTree,
} from "@app/components/data_source_view/context/utils";
import type { DataSourceContentNode } from "@app/lib/api/search";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { DataSourceViewContentNode, SpaceType } from "@app/types";
import { isDataSourceViewCategoryWithoutApps } from "@app/types";

interface DataSourceSearchResultsProps {
  currentSpace: SpaceType | null;
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
  isRowSelected: (
    rowId: string,
    node: DataSourceViewContentNode
  ) => boolean | "partial",
  selectNode: (
    entry: NavigationHistoryEntryType,
    node: DataSourceViewContentNode
  ) => void,
  removeNode: (
    entry: NavigationHistoryEntryType,
    node: DataSourceViewContentNode
  ) => void
): ColumnDef<SearchResultRowData>[] {
  return [
    {
      id: "selection",
      header: "",
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const selectionState = isRowSelected(row.original.id, row.original);

        return (
          <div className="flex h-full items-center">
            <Checkbox
              checked={selectionState}
              onCheckedChange={(state) => {
                if (selectionState === "partial" || state) {
                  selectNode(row.original.entry, row.original);
                } else {
                  removeNode(row.original.entry, row.original);
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
        sizeRatio: 50,
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
        sizeRatio: 35,
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
                  "compact"
                )
              : "-"
          }
        />
      ),
      meta: {
        sizeRatio: 15,
      },
    },
  ];
}

export function DataSourceSearchResults({
  currentSpace,
  searchResultNodes,
  isLoading,
  onClearSearch,
  error,
}: DataSourceSearchResultsProps) {
  const { spaces } = useSpacesContext();
  const {
    setSpaceEntry,
    setCategoryEntry,
    setDataSourceViewEntry,
    addNodeEntry,
  } = useDataSourceBuilderContext();

  const { field } = useSourcesFormController();

  // Build proper ID-based path for search results (matching navigation system)
  const buildNodePath = useCallback(
    (node: DataSourceViewContentNode): string[] => {
      const { dataSourceView } = node;
      const space = spaces.find((s) => s.sId === dataSourceView.spaceId);

      if (!space) {
        return [];
      }

      // Build path using IDs: ["root", spaceId, category, dataSourceViewId, nodeId]
      return [
        "root",
        space.sId, // Use space ID, not name
        dataSourceView.category,
        dataSourceView.sId, // Use dataSourceView ID
        node.internalId,
      ];
    },
    [spaces]
  );

  // Custom isRowSelected for search results that uses the actual node path
  const isSearchRowSelected = useCallback(
    (rowId: string, node: DataSourceViewContentNode) => {
      // Return false if field is not available (not in form context)
      if (!field?.value) {
        return false;
      }

      const nodePath = buildNodePath(node);
      if (nodePath.length === 0) {
        return false;
      }

      return isNodeSelected(field.value, nodePath);
    },
    [field, buildNodePath]
  );

  // Custom selectNode for search results that uses the correct path
  const selectSearchNode = useCallback(
    (entry: NavigationHistoryEntryType, node: DataSourceViewContentNode) => {
      if (!field?.value || !field?.onChange) {
        return;
      }

      const nodePath = buildNodePath(node);
      if (nodePath.length === 0) {
        return;
      }

      field.onChange(
        addNodeToTree(field.value, {
          path: pathToString(nodePath),
          name: navigationHistoryEntryTitle(entry),
          ...entry,
        })
      );
    },
    [field, buildNodePath]
  );

  // Custom removeNode for search results that uses the correct path
  const removeSearchNode = useCallback(
    (entry: NavigationHistoryEntryType, node: DataSourceViewContentNode) => {
      if (!field?.value || !field?.onChange) {
        return;
      }

      const nodePath = buildNodePath(node);
      if (nodePath.length === 0) {
        return;
      }

      field.onChange(
        removeNodeFromTree(field.value, {
          path: pathToString(nodePath),
          name: navigationHistoryEntryTitle(entry),
          ...entry,
        })
      );
    },
    [field, buildNodePath]
  );

  // Process search results for the table
  // Convert DataSourceContentNode[] to DataSourceViewContentNode[]
  const searchResults: DataSourceViewContentNode[] = useMemo(() => {
    const results: DataSourceViewContentNode[] = [];

    for (const node of searchResultNodes) {
      const { dataSourceViews, ...contentNodeData } = node;

      for (const view of dataSourceViews) {
        results.push({
          ...contentNodeData,
          dataSourceView: view,
        });
      }
    }

    return results;
  }, [searchResultNodes]);

  const spaceMap = useMemo(
    () => new Map(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  const handleSearchResultClick = useCallback(
    (node: DataSourceViewContentNode) => {
      onClearSearch();

      // Navigate to the search result based on its type and location
      if (node.expandable) {
        const { dataSourceView } = node;

        if (isDataSourceViewCategoryWithoutApps(dataSourceView.category)) {
          // Find space using optimized lookup
          const space = spaceMap.get(dataSourceView.spaceId);
          if (!space) {
            return;
          }

          // Reset navigation to space level first
          setSpaceEntry(space);

          // Then navigate through the hierarchy to reach this node
          if (node.mimeType === DATA_SOURCE_MIME_TYPE) {
            // Navigate to data source level: Space > Category > DataSource
            setCategoryEntry(dataSourceView.category);
            setDataSourceViewEntry(dataSourceView);
          } else {
            // Navigate to the node level: Space > Category > DataSource > Node
            setCategoryEntry(dataSourceView.category);
            setDataSourceViewEntry(dataSourceView);
            addNodeEntry(node);
          }
        }
      }
    },
    [
      onClearSearch,
      spaceMap,
      setSpaceEntry,
      setCategoryEntry,
      setDataSourceViewEntry,
      addNodeEntry,
    ]
  );

  const createNavigationEntry = (
    node: DataSourceViewContentNode
  ): NavigationHistoryEntryType => {
    if (node.mimeType === DATA_SOURCE_MIME_TYPE) {
      return {
        type: "data_source",
        dataSourceView: node.dataSourceView,
        tagsFilter: null,
      };
    } else {
      return {
        type: "node",
        node: node,
        tagsFilter: null,
      };
    }
  };

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

  const columns = useMemo(
    () =>
      makeSearchResultColumnsWithSelection(
        isSearchRowSelected,
        selectSearchNode,
        removeSearchNode
      ),
    [isSearchRowSelected, selectSearchNode, removeSearchNode]
  );

  if (!error && !isLoading && searchResults.length === 0) {
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
    <>
      {error ? (
        <div className="text-end text-sm text-muted-foreground">
          Error searching results.
        </div>
      ) : (
        <>
          <div className="flex flex-row items-center justify-between text-end text-sm text-muted-foreground dark:text-muted-foreground-night">
            <div>
              {currentSpace !== null && (
                <>
                  Searching in{" "}
                  <span className="font-medium">{currentSpace.name}</span>
                </>
              )}
            </div>
            <div>
              {isLoading
                ? "Searching..."
                : `${searchResults.length} results found`}
            </div>
          </div>
          <ScrollableDataTable
            data={searchTableRows}
            columns={columns}
            className={cn(
              "pb-4",
              isLoading && "pointer-events-none opacity-50"
            )}
            totalRowCount={searchResults.length}
            maxHeight
          />
        </>
      )}
    </>
  );
}
