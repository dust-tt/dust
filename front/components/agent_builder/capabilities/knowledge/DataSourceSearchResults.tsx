// All mime types are okay to use from the public API.
// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { DATA_SOURCE_MIME_TYPE } from "@dust-tt/client";
import { cn } from "@dust-tt/sparkle";
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
import type { DataSourceListItem } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import { DataSourceList } from "@app/components/agent_builder/capabilities/knowledge/DataSourceList";
import type { DataSourceContentNode } from "@app/lib/api/search";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import type { DataSourceViewContentNode } from "@app/types";
import { isDataSourceViewCategoryWithoutApps } from "@app/types";

interface DataSourceSearchResultsProps {
  searchResultNodes: DataSourceContentNode[];
  isLoading: boolean;
  onClearSearch: () => void;
  error?: Error | null;
}

export function DataSourceSearchResults({
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

  const itemNodeMap = useMemo(() => {
    const m = new Map<string, DataSourceViewContentNode>();
    // Use composite ID to avoid collisions across data sources
    for (const node of searchResults) {
      const id = `${node.dataSourceView.sId}:${node.internalId}`;
      m.set(id, node);
    }
    return m;
  }, [searchResults]);

  const listItems: DataSourceListItem[] = useMemo(() => {
    return searchResults.map((node) => {
      const id = `${node.dataSourceView.sId}:${node.internalId}`;
      return {
        id,
        title: node.title,
        icon: getVisualForDataSourceViewContentNode(node),
        onClick: node.expandable
          ? () => handleSearchResultClick(node)
          : undefined,
        entry: createNavigationEntry(node),
      } satisfies DataSourceListItem;
    });
  }, [searchResults, handleSearchResultClick]);

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
        <DataSourceList
          items={listItems}
          isLoading={isLoading}
          className={cn("pb-4", isLoading && "pointer-events-none opacity-50")}
          // Override selection state to use full path based on node
          isItemSelected={(item) => {
            const node = itemNodeMap.get(item.id);
            if (!node) return false;
            return isSearchRowSelected(item.id, node);
          }}
          // Override selection change to add/remove using full path
          onSelectionChange={async (item, selectionState, state) => {
            const node = itemNodeMap.get(item.id);
            if (!node) return;
            if (selectionState === "partial" || state) {
              selectSearchNode(item.entry, node);
            } else {
              removeSearchNode(item.entry, node);
            }
          }}
          headerTitle="Name"
          rightHeaderTitle="Location"
          showSelectAllHeader={false}
          renderRight={(item) => {
            const node = itemNodeMap.get(item.id);
            if (!node) return "";
            return node.dataSourceView.category === "folder"
              ? node.dataSourceView.dataSource.name
              : getLocationForDataSourceViewContentNode(node);
          }}
        />
      )}
    </>
  );
}
