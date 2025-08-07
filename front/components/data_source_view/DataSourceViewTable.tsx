import {
  Checkbox,
  DataTable,
  Hoverable,
  ScrollableDataTable,
  Spinner,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import { useAgentBuilderContext } from "@app/components/agent_builder/AgentBuilderContext";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  findCategoryFromNavigationHistory,
  findSpaceFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { useSpaceDataSourceViews } from "@app/lib/swr/spaces";
import type { DataSourceViewType } from "@app/types";

type RowData = {
  id: string;
  title: string;
  onClick?: () => void;
  icon?: React.ComponentType;
  dataSourceView: DataSourceViewType;
};

export function DataSourceViewTable() {
  const { owner } = useAgentBuilderContext();
  const {
    navigationHistory,
    isCurrentNavigationEntrySelected,
    selectCurrentNavigationEntry,
    removeCurrentNavigationEntry,
    isRowSelected,
    isRowSelectable,
    selectNode,
    removeNode,
    setDataSourceViewEntry,
  } = useDataSourceBuilderContext();
  const space = findSpaceFromNavigationHistory(navigationHistory);

  const selectedCategory = findCategoryFromNavigationHistory(navigationHistory);
  const { spaceDataSourceViews, isSpaceDataSourceViewsLoading } =
    useSpaceDataSourceViews({
      category: selectedCategory ?? undefined,
      workspaceId: owner.sId,
      spaceId: space?.sId ?? "",
    });

  const columns: ColumnDef<RowData>[] = useMemo(
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
                  const item: NavigationHistoryEntryType = {
                    type: "data_source",
                    dataSourceView: row.original.dataSourceView,
                  };
                  if (selectionState === "partial" || state) {
                    selectNode(item);
                  } else {
                    removeNode(item);
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
            <Hoverable>
              {row.original.title} - {row.original.id}
            </Hoverable>
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

  const rows: RowData[] = spaceDataSourceViews.map((dsv) => ({
    id: dsv.dataSource.sId,
    title: dsv.dataSource.name,
    onClick: () => setDataSourceViewEntry(dsv),
    dataSourceView: dsv,
    // TODO: Put icon
  }));

  if (isSpaceDataSourceViewsLoading) {
    return (
      <div className="flex justify-center p-4">
        <Spinner size="md" />
      </div>
    );
  }

  return (
    <ScrollableDataTable
      data={rows}
      columns={columns}
      maxHeight="max-h-[600px]"
      getRowId={(row) => row.id}
    />
  );
}
