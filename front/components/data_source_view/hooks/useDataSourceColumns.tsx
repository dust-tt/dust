import { Checkbox, DataTable, Hoverable } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { isRemoteDatabase } from "@app/lib/data_sources";

import { findDataSourceViewFromNavigationHistory } from "../context/utils";

export type DataSourceRowData = {
  id: string;
  title: string;
  onClick?: () => void;
  icon?: React.ComponentType;
  entry: NavigationHistoryEntryType;
};

export const useDataSourceColumns = () => {
  const {
    navigationHistory,
    selectNode,
    selectCurrentNavigationEntry,
    removeNode,
    removeCurrentNavigationEntry,
    isRowSelected,
    isRowSelectable,
    isCurrentNavigationEntrySelected,
  } = useDataSourceBuilderContext();

  const columns: ColumnDef<DataSourceRowData>[] = useMemo(() => {
    const entry = findDataSourceViewFromNavigationHistory(navigationHistory);

    return [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: () => {
          const selectionState = isCurrentNavigationEntrySelected();
          const currentEntry = navigationHistory[navigationHistory.length - 1];
          const shouldHideSelectColumn =
            (entry !== null &&
              isRemoteDatabase(entry.dataSource) &&
              currentEntry.type === "node" &&
              currentEntry.node.type === "folder") ||
            (currentEntry.type === "data_source" &&
              isRemoteDatabase(currentEntry.dataSourceView.dataSource));

          if (shouldHideSelectColumn && selectionState !== "partial") {
            return undefined;
          }

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
          const shouldHideSelect =
            (entry != null &&
              isRemoteDatabase(entry.dataSource) &&
              row.original.entry.type === "node" &&
              row.original.entry.node.type === "folder") ||
            (row.original.entry.type === "data_source" &&
              isRemoteDatabase(row.original.entry.dataSourceView.dataSource));

          if (shouldHideSelect && selectionState !== "partial") {
            return undefined;
          }

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
                    selectNode(row.original.entry);
                  } else {
                    removeNode(row.original.entry);
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
    ];
  }, [
    isCurrentNavigationEntrySelected,
    isRowSelectable,
    isRowSelected,
    navigationHistory,
    removeCurrentNavigationEntry,
    removeNode,
    selectCurrentNavigationEntry,
    selectNode,
  ]);

  return columns;
};
