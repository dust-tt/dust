import { isFolder, isWebsite } from "@dust-tt/client";
import {
  Checkbox,
  DataTable,
  DoubleIcon,
  Icon,
  ScrollableDataTable,
  SearchInput,
} from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import type { Dispatch, SetStateAction } from "react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import { useDebounce } from "@app/hooks/useDebounce";
import { getConnectorProviderLogoWithFallback } from "@app/lib/connector_providers";
import { getVisualForDataSourceViewContentNode } from "@app/lib/content_nodes";
import { useSpaceSearch } from "@app/lib/swr/spaces";
import type {
  ContentNodesViewType,
  DataSourceViewContentNode,
  DataSourceViewSelectionConfigurations,
  DataSourceViewType,
  LightWorkspaceType,
  SpaceType,
} from "@app/types";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types";

interface TableRowData {
  id: string;
  title: string;
  onClick?: () => void;
  parentTitle?: string;
  icon?: React.JSX.Element;
}

export function getTableRows(
  nodes: DataSourceViewContentNode[],
  onNodeClick: (node: DataSourceViewContentNode) => void
): TableRowData[] {
  return nodes.map((node) => {
    const { dataSource } = node.dataSourceView;
    const logo = getConnectorProviderLogoWithFallback({
      provider: dataSource.connectorProvider,
    });
    const isWebsiteOrFolder = isWebsite(dataSource) || isFolder(dataSource);
    const visual = isWebsiteOrFolder ? (
      <Icon visual={logo} />
    ) : (
      <DoubleIcon
        mainIconProps={{
          visual: getVisualForDataSourceViewContentNode(node),
          size: "sm",
        }}
        secondaryIconProps={{
          visual: logo,
          size: "xs",
        }}
      />
    );
    return {
      id: node.internalId,
      title: node.title,
      icon: visual,
      parentTitle: node.parentTitle,
      onClick: node.expandable ? () => onNodeClick(node) : undefined,
    };
  });
}

interface DataSourceTableSelectorProps {
  owner: LightWorkspaceType;
  dataSourceViews: DataSourceViewType[];
  selectionConfigurations: DataSourceViewSelectionConfigurations;
  setSelectionConfigurations: Dispatch<
    SetStateAction<DataSourceViewSelectionConfigurations>
  >;
  viewType: ContentNodesViewType;
  isRootSelectable: boolean;
  space: SpaceType;
  updateBreadcrumbs: (label: string, onClick: () => void) => void;
  traversedNode: DataSourceViewContentNode | undefined;
  setTraversedNode: Dispatch<
    SetStateAction<DataSourceViewContentNode | undefined>
  >;
}

const PAGE_SIZE = 25;

export function DataSourceTableSelector({
  owner,
  dataSourceViews,
  viewType,
  space,
  updateBreadcrumbs,
  traversedNode,
  setTraversedNode,
}: DataSourceTableSelectorProps) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searchResults, setSearchResults] = useState<TableRowData[]>([]);

  const {
    cursorPagination,
    resetPagination,
    handlePaginationChange,
    tablePagination,
  } = useCursorPaginationForDataTable(PAGE_SIZE);

  const {
    inputValue: searchSpaceText,
    debouncedValue: debouncedSearch,
    isDebouncing,
    setValue: setSearchSpaceText,
  } = useDebounce("", {
    delay: 300,
    minLength: MIN_SEARCH_QUERY_SIZE,
  });

  useEffect(() => {
    resetPagination();
  }, [debouncedSearch, resetPagination]);

  const {
    searchResultNodes,
    isSearchLoading,
    isSearchValidating,
    nextPageCursor,
  } = useSpaceSearch({
    dataSourceViews: traversedNode
      ? [traversedNode.dataSourceView]
      : dataSourceViews,
    includeDataSources: true,
    owner,
    search: debouncedSearch,
    viewType,
    space,
    pagination: { cursor: cursorPagination.cursor, limit: PAGE_SIZE },
    parentId: traversedNode ? traversedNode.internalId : undefined,
  });

  const isLoading = isDebouncing || isSearchLoading || isSearchValidating;

  const handleLoadMore = useCallback(() => {
    if (nextPageCursor && !isSearchValidating) {
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
    isSearchValidating,
    handlePaginationChange,
    tablePagination.pageIndex,
  ]);

  useEffect(() => {
    const tableRows = getTableRows(
      searchResultNodes,
      (node: DataSourceViewContentNode) => {
        setTraversedNode(node);
        setSearchSpaceText("");
        updateBreadcrumbs(node.title, () => setTraversedNode(node));
      }
    );
    if (tablePagination.pageIndex === 0) {
      setSearchResults(tableRows);
    } else if (searchResultNodes.length > 0) {
      setSearchResults((prev) => [...prev, ...tableRows]);
    }
  }, [
    searchResultNodes,
    setSearchSpaceText,
    tablePagination.pageIndex,
    updateBreadcrumbs,
  ]);

  const columns: ColumnDef<TableRowData>[] = useMemo(
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
            <span className="flex items-center gap-2 truncate text-ellipsis font-semibold">
              {row.original.icon}
              {row.original.title}
            </span>
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 70,
        },
      },
      {
        accessorKey: "parentTitle",
        id: "parentTitle",
        header: "Parent",
        cell: ({ row }) => (
          <DataTable.CellContent>
            <span className="flex items-center gap-2 truncate text-ellipsis text-sm text-muted-foreground">
              {row.original.parentTitle}
            </span>
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 25,
        },
      },
    ],
    []
  );

  return (
    <div>
      <SearchInput
        name="search"
        placeholder="Search (Name)"
        value={searchSpaceText}
        onChange={setSearchSpaceText}
      />
      <ScrollableDataTable
        data={searchResults}
        columns={columns}
        onLoadMore={handleLoadMore}
        isLoading={isLoading}
        maxHeight="max-h-[600px]"
        rowSelection={rowSelection}
        setRowSelection={setRowSelection}
        enableRowSelection={true}
        getRowId={(row) => row.id}
      />
    </div>
  );
}
