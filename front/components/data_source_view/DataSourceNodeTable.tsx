import {
  Checkbox,
  DataTable,
  Hoverable,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import {
  findDataSourceViewFromNavigationHistory,
  getLatestNodeFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
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
  const [nodeRows, setNodeRows] = useState<NodeRowData[]>([]);
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
    cursorPagination,
    resetPagination,
    handlePaginationChange,
    tablePagination,
  } = useCursorPaginationForDataTable(PAGE_SIZE);

  const {
    nodes: childNodes,
    isNodesLoading,
    nextPageCursor,
  } = useDataSourceViewContentNodes({
    owner,
    dataSourceView:
      traversedNode?.dataSourceView ?? dataSourceView ?? undefined,
    parentId:
      traversedNode !== null && traversedNode.parentInternalIds !== null
        ? traversedNode.internalId
        : undefined,
    viewType,
    pagination: { cursor: cursorPagination.cursor, limit: PAGE_SIZE },
  });

  useEffect(() => {
    resetPagination();
  }, [traversedNode, resetPagination]);

  const handleLoadMore = useCallback(() => {
    if (nextPageCursor && !isNodesLoading) {
      handlePaginationChange(
        {
          pageIndex: tablePagination.pageIndex + 1,
          pageSize: PAGE_SIZE,
        },
        nextPageCursor
      );
    }
  }, [
    nextPageCursor,
    isNodesLoading,
    handlePaginationChange,
    tablePagination.pageIndex,
  ]);

  useEffect(() => {
    if (childNodes.length > 0) {
      // Handle child nodes
      if (tablePagination.pageIndex === 0) {
        const rows = getTableRows(childNodes, (node) => {
          addNodeEntry(node);
        });
        setNodeRows(rows);
      } else {
        // Append new nodes when paginating
        const newRows = getTableRows(childNodes, (node) => {
          addNodeEntry(node);
        });
        setNodeRows((prev) => [...prev, ...newRows]);
      }
    } else {
      setNodeRows([]);
    }
  }, [childNodes, tablePagination.pageIndex, addNodeEntry]);

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
        <>
          <ScrollableDataTable
            data={nodeRows}
            columns={columns}
            maxHeight="max-h-[600px]"
            getRowId={(row) => row.id}
            onLoadMore={handleLoadMore}
          />
        </>
      )}
    </div>
  );
}

function getTableRows(
  nodes: DataSourceViewContentNode[],
  onNodeClick: (node: DataSourceViewContentNode) => void
): NodeRowData[] {
  return nodes.map((node) => {
    return {
      id: node.internalId,
      title: node.title,
      icon: getVisualForDataSourceViewContentNode(node),
      onClick: node.expandable ? () => onNodeClick(node) : undefined,
      rawNodeData: node,
    };
  });
}
