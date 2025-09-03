import { Checkbox, cn, DataTable, Hoverable } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useContext, useMemo } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  findDataSourceViewFromNavigationHistory,
  navigationHistoryEntryTitle,
} from "@app/components/data_source_view/context/utils";
import { isRemoteDatabase } from "@app/lib/data_sources";

export type DataSourceRowData = {
  id: string;
  title: string;
  onClick?: () => void;
  icon?: React.ComponentType;
  entry: NavigationHistoryEntryType;
};

function shouldHideColumn(
  navigationHistory: NavigationHistoryEntryType[],
  entry: NavigationHistoryEntryType
): boolean {
  if (entry.type === "category") {
    return true;
  }
  if (
    entry.type === "data_source" &&
    isRemoteDatabase(entry.dataSourceView.dataSource)
  ) {
    return true;
  }

  const dataSourceEntry =
    findDataSourceViewFromNavigationHistory(navigationHistory);
  if (dataSourceEntry === null) {
    return false;
  }

  return (
    isRemoteDatabase(dataSourceEntry.dataSource) &&
    entry.type === "node" &&
    entry.node.type === "folder"
  );
}

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
  const confirm = useContext(ConfirmContext);

  const columns: ColumnDef<DataSourceRowData>[] = useMemo(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        header: () => {
          const selectionState = isCurrentNavigationEntrySelected();
          const currentEntry = navigationHistory[navigationHistory.length - 1];
          if (!currentEntry) {
            return null;
          }

          const hideColumn =
            shouldHideColumn(navigationHistory, currentEntry) &&
            selectionState !== "partial";

          return (
            <Checkbox
              key={`header-${selectionState}`}
              size="sm"
              className={cn(hideColumn && "invisible")}
              checked={selectionState}
              disabled={!isRowSelectable() || hideColumn}
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={async (state) => {
                const isUnselectingPartial = selectionState === "partial";
                const isUnselecting = isUnselectingPartial || !state;

                if (isUnselecting) {
                  const confirmed = await confirm({
                    title: "Are you sure?",
                    message: `Do you want to unselect ${isUnselectingPartial ? "all of" : ""} "${navigationHistoryEntryTitle(currentEntry)}"?`,
                    validateLabel: isUnselectingPartial
                      ? "Unselect all"
                      : "Unselect",
                    validateVariant: "warning",
                  });
                  if (!confirmed) {
                    return;
                  }
                }

                if (isUnselectingPartial) {
                  removeCurrentNavigationEntry();
                } else {
                  state
                    ? selectCurrentNavigationEntry()
                    : removeCurrentNavigationEntry();
                }
              }}
            />
          );
        },
        cell: ({ row }) => {
          const selectionState = isRowSelected(row.original.id);
          const hideColumn =
            shouldHideColumn(navigationHistory, row.original.entry) &&
            selectionState !== "partial";

          return (
            <div className="flex h-full w-full items-center">
              <Checkbox
                key={`${row.original.id}-${selectionState}`}
                size="sm"
                checked={selectionState}
                className={cn(hideColumn && "invisible")}
                disabled={!isRowSelectable(row.original.id) || hideColumn}
                onClick={(event) => event.stopPropagation()}
                onCheckedChange={async (state) => {
                  if (selectionState === "partial") {
                    const confirmed = await confirm({
                      title: "Are you sure?",
                      message: `Do you want to unselect all of "${navigationHistoryEntryTitle(row.original.entry)}"?`,
                      validateLabel: "Unselect all",
                      validateVariant: "warning",
                    });
                    if (!confirmed) {
                      return;
                    }
                  }

                  if (selectionState === "partial") {
                    removeNode(row.original.entry);
                  } else if (state) {
                    selectNode(row.original.entry);
                  } else {
                    if (row.original.entry.type === "data_source") {
                      const confirmed = await confirm({
                        title: "Are you sure?",
                        message: `Do you want to unselect "${navigationHistoryEntryTitle(row.original.entry)}"?`,
                        validateLabel: "Unselect",
                        validateVariant: "warning",
                      });
                      if (confirmed) {
                        removeNode(row.original.entry);
                      }
                    } else {
                      removeNode(row.original.entry);
                    }
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
      confirm,
      isCurrentNavigationEntrySelected,
      isRowSelectable,
      isRowSelected,
      navigationHistory,
      removeCurrentNavigationEntry,
      removeNode,
      selectCurrentNavigationEntry,
      selectNode,
    ]
  );

  return columns;
};
