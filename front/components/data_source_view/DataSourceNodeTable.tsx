import { isFolder, isWebsite } from "@dust-tt/client";
import {
  Checkbox,
  DataTable,
  Hoverable,
  Icon,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useTheme } from "@app/components/sparkle/ThemeContext";
import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { getDataSourceNameFromView } from "@app/lib/data_sources";
import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import type {
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewType,
  WorkspaceType,
} from "@app/types";

const PAGE_SIZE = 25;

interface DataSourceNodeTableProps {
  owner: WorkspaceType;
  viewType: ContentNodesViewType;
  categoryDataSourceViews?: DataSourceViewType[];
  selectedCategory?: string;
  traversedNode: DataSourceViewContentNode | null;
  onNavigate: (node: DataSourceViewContentNode) => void;
  isCategoryLoading?: boolean;
}

interface NodeRowData {
  id: string;
  title: string;
  onClick?: () => void;
  parentTitle: string | null;
  icon?: React.JSX.Element;
}

export function DataSourceNodeTable({
  owner,
  viewType,
  categoryDataSourceViews = [],
  selectedCategory,
  traversedNode,
  onNavigate,
  isCategoryLoading = false,
}: DataSourceNodeTableProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [nodeRows, setNodeRows] = useState<NodeRowData[]>([]);
  const { isDark } = useTheme();

  const {
    cursorPagination,
    resetPagination,
    handlePaginationChange,
    tablePagination,
  } = useCursorPaginationForDataTable(PAGE_SIZE);

  const {
    nodes: childNodes,
    isNodesLoading: isChildrenLoading,
    nextPageCursor,
  } = useDataSourceViewContentNodes({
    owner,
    dataSourceView: traversedNode?.dataSourceView,
    ...(traversedNode &&
      traversedNode.parentInternalIds && {
        parentId: traversedNode.internalId,
      }),
    viewType,
    pagination: { cursor: cursorPagination.cursor, limit: PAGE_SIZE },
  });

  useEffect(() => {
    resetPagination();
  }, [traversedNode, resetPagination]);

  const handleLoadMore = useCallback(() => {
    if (nextPageCursor && !isChildrenLoading) {
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
    isChildrenLoading,
    handlePaginationChange,
    tablePagination.pageIndex,
  ]);

  useEffect(() => {
    if (!traversedNode && selectedCategory) {
      // Listing data source views of a category
      // Convert data source views to content nodes
      const categoryNodes = categoryDataSourceViews
        .filter((dsv) => {
          if (selectedCategory === "managed") {
            return !isFolder(dsv.dataSource) && !isWebsite(dsv.dataSource);
          }
          if (selectedCategory === "folder") {
            return isFolder(dsv.dataSource);
          }
          if (selectedCategory === "website") {
            return isWebsite(dsv.dataSource);
          }
          return false;
        })
        .map((dsv) => {
          const logo = getConnectorProviderLogoWithFallback({
            provider: dsv.dataSource.connectorProvider,
            isDark,
          });

          return {
            id: dsv.sId,
            internalId: dsv.sId,
            title: dsv.dataSource.name,
            icon: <Icon visual={logo} />,
            parentTitle: null,
            onClick: () => {
              const contentNode: DataSourceViewContentNode = {
                internalId: dsv.sId,
                title: getDataSourceNameFromView(dsv),
                dataSourceView: dsv,
                expandable: true,
                parentInternalIds: null,
                type: "folder",
                mimeType: "application/vnd.dust.folder",
                parentTitle: null,
                lastUpdatedAt: null,
                parentInternalId: null,
                permission: "read",
                sourceUrl: null,
                providerVisibility: null,
              };
              onNavigate(contentNode);
            },
          };
        });
      setNodeRows(categoryNodes);
    } else if (traversedNode && childNodes.length > 0) {
      // Handle child nodes
      if (tablePagination.pageIndex === 0) {
        const rows = getTableRows(childNodes, (node) => {
          onNavigate(node);
        });
        setNodeRows(rows);
      } else {
        // Append new nodes when paginating
        const newRows = getTableRows(childNodes, (node) => {
          onNavigate(node);
        });
        setNodeRows((prev) => [...prev, ...newRows]);
      }
    } else {
      setNodeRows([]);
    }
  }, [
    traversedNode,
    selectedCategory,
    categoryDataSourceViews,
    childNodes,
    tablePagination.pageIndex,
    onNavigate,
    isDark,
  ]);

  const columns: ColumnDef<NodeRowData>[] = useMemo(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: ({ table }) => (
          <Checkbox
            size="xs"
            checked={
              table.getIsAllRowsSelected()
                ? true
                : table.getIsSomeRowsSelected()
                  ? "partial"
                  : false
            }
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(state) => {
              if (state === "indeterminate") {
                return;
              }
              table.toggleAllRowsSelected(state);
            }}
          />
        ),
        cell: ({ row }) => (
          <div className="flex h-full w-full items-center">
            <Checkbox
              size="xs"
              checked={row.getIsSelected()}
              disabled={!row.getCanSelect()}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(state) => {
                if (state === "indeterminate") {
                  return;
                }
                row.toggleSelected(state);
              }}
            />
          </div>
        ),
        meta: {
          sizeRatio: 5,
        },
      },
      {
        accessorKey: "title",
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <DataTable.CellContent>
            <span className="flex items-center gap-2 truncate text-ellipsis py-1 font-semibold">
              {row.original.icon}
              <Hoverable>{row.original.title}</Hoverable>
            </span>
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 70,
        },
      },
    ],
    []
  );

  const isLoading =
    !traversedNode && selectedCategory ? isCategoryLoading : isChildrenLoading;

  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center p-4">
          <Spinner size="md" />
        </div>
      ) : (
        <ScrollableDataTable
          data={nodeRows}
          columns={columns}
          maxHeight="max-h-[600px]"
          rowSelection={rowSelection}
          setRowSelection={setRowSelection}
          enableRowSelection={true}
          getRowId={(row) => row.id}
          onLoadMore={handleLoadMore}
        />
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
      icon: (
        <Icon visual={getVisualForDataSourceViewContentNode(node)} size="md" />
      ),
      parentTitle: node.parentTitle,
      onClick: node.expandable ? () => onNodeClick(node) : undefined,
    };
  });
}
