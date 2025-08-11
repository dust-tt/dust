import {
  Checkbox,
  DataTable,
  Hoverable,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useCallback, useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  findDataSourceViewFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { useInfinitDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type {
  ContentNodesViewType,
  DataSourceViewContentNode,
} from "@app/types";

const PAGE_SIZE = 25;

interface DataSourceNodeTableProps {
  viewType: ContentNodesViewType;
}

interface NodeRowData {
  id: string;
  title: string;
  onClick?: () => void;
  icon?: React.ComponentType;
  rawNodeData: DataSourceViewContentNode;
}

export function DataSourceNodeTable({ viewType }: DataSourceNodeTableProps) {
  const { owner } = useAgentBuilderContext();
  const {
    navigationHistory,
    selectNode,
    selectCurrentNavigationEntry,
    removeNode,
    removeCurrentNavigationEntry,
    isRowSelected,
    isRowSelectable,
    isCurrentNavigationEntrySelected,
    addNodeEntry,
  } = useDataSourceBuilderContext();

  const traversedNode = getLatestNodeFromNavigationHistory(navigationHistory);
  const dataSourceView =
    findDataSourceViewFromNavigationHistory(navigationHistory);

  const {
    nodes: childNodes,
    isNodesLoading,
    hasNextPage,
    loadMore,
  } = useInfinitDataSourceViewContentNodes({
    owner,
    dataSourceView:
      traversedNode?.dataSourceView ?? dataSourceView ?? undefined,
    parentId:
      traversedNode !== null && traversedNode.parentInternalIds !== null
        ? traversedNode.internalId
        : undefined,
    viewType,
    pagination: { limit: PAGE_SIZE, cursor: null },
  });

  const handleLoadMore = useCallback(async () => {
    if (hasNextPage && !isNodesLoading) {
      await loadMore();
    }
  }, [hasNextPage, isNodesLoading, loadMore]);

  const nodeRows: NodeRowData[] = useMemo(
    () =>
      childNodes.map((node) => {
        return {
          id: node.internalId,
          title: node.title,
          icon: getVisualForDataSourceViewContentNode(node),
          onClick: node.expandable ? () => addNodeEntry(node) : undefined,
          rawNodeData: node,
        };
      }),
    [childNodes, addNodeEntry]
  );

  const columns: ColumnDef<NodeRowData>[] = useMemo(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: () => {
          const selectionState = isCurrentNavigationEntrySelected();
          return (
            <Checkbox
              key={`header-${selectionState}`}
              size="xs"
              checked={selectionState}
              disabled={!isRowSelectable()}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(state) => {
                // When clicking a partial checkbox, select all
                if (selectionState === "partial" || state) {
                  selectCurrentNavigationEntry();
                } else {
                  removeCurrentNavigationEntry();
                }
              }}
            />
          );
        },
        cell: ({ row }) => {
          const selectionState = isRowSelected(row.original.id);

          return (
            <div className="flex h-full w-full items-center">
              <Checkbox
                key={`${row.original.id}-${selectionState}`}
                size="xs"
                checked={selectionState}
                disabled={!isRowSelectable(row.original.id)}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={(state) => {
                  // When clicking a partial checkbox, select all
                  if (selectionState === "partial" || state) {
                    selectNode({
                      type: "node",
                      node: row.original.rawNodeData,
                    });
                  } else {
                    removeNode({
                      type: "node",
                      node: row.original.rawNodeData,
                    });
                  }
                }}
              />
            </div>
          );
        },
        meta: {
          sizeRatio: 5,
        },
      },
      {
        accessorKey: "title",
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <DataTable.CellContent icon={row.original.icon}>
            <Hoverable>{row.original.title}</Hoverable>
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 70,
        },
      },
    ],
    [
      isCurrentNavigationEntrySelected,
      isRowSelectable,
      isRowSelected,
      removeCurrentNavigationEntry,
      removeNode,
      selectCurrentNavigationEntry,
      selectNode,
    ]
  );

  return (
    <div>
      {isNodesLoading ? (
        <div className="flex justify-center p-4">
          <Spinner size="md" />
        </div>
      ) : (
        <ScrollableDataTable
          data={nodeRows}
          columns={columns}
          getRowId={(row) => row.id}
          onLoadMore={handleLoadMore}
        />
      )}
    </div>
  );
}
