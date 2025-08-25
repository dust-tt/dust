import {
  Checkbox,
  DataTable,
  ScrollableDataTable,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useContext, useMemo } from "react";

import { DISABLED_REASON } from "@app/components/agent_builder/get_allowed_spaces";
import { ConfirmContext } from "@app/components/Confirm";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";
import { SPACE_KINDS } from "@app/types";

type SpaceRowData = SpaceType & {
  id: string;
  icon: React.ComponentType;
  onClick: (() => void) | undefined;
  disabled: boolean;
};

export interface DataSourceSpaceSelectorProps {
  spaces: SpaceType[];
  allowedSpaces?: SpaceType[];
}

export function DataSourceSpaceSelector({
  spaces,
  allowedSpaces = [],
}: DataSourceSpaceSelectorProps) {
  const { removeNode, isRowSelected, setSpaceEntry } =
    useDataSourceBuilderContext();

  const confirm = useContext(ConfirmContext);

  const spaceRows: SpaceRowData[] = spaces
    .map((space) => {
      const disabled = allowedSpaces.find((s) => s.sId === space.sId) == null;
      return {
        ...space,
        id: space.sId,
        name: space.name,
        kind: space.kind,
        icon: getSpaceIcon(space),
        onClick: disabled ? undefined : () => setSpaceEntry(space),
        disabled,
      };
    })
    .toSorted((a, b) => {
      // First, sort by kind according to the specified order
      const aKindIndex = SPACE_KINDS.indexOf(a.kind);
      const bKindIndex = SPACE_KINDS.indexOf(b.kind);

      // If kinds are different, sort by kind order
      if (aKindIndex !== bKindIndex) {
        return aKindIndex - bKindIndex;
      }

      // If kinds are the same, sort by isRestricted (non-restricted first)
      if (a.isRestricted !== b.isRestricted) {
        return a.isRestricted ? 1 : -1;
      }

      // If kinds and isRestricted are the same, sort by name alphabetically
      return a.name.localeCompare(b.name);
    });

  const columns: ColumnDef<SpaceRowData>[] = useMemo(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const selectionState = isRowSelected(row.original.id);
          if (selectionState !== "partial") {
            return undefined;
          }
          return (
            <div className="flex h-full items-center">
              <Tooltip
                trigger={
                  <Checkbox
                    size="xs"
                    checked={selectionState}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={async () => {
                      const item: NavigationHistoryEntryType = {
                        type: "space",
                        space: row.original,
                      };
                      const confirmed = await confirm({
                        title: "Are you sure?",
                        message: `Do you want to unselect all of "${row.original.name}"?`,
                        validateLabel: "Unselect all",
                        validateVariant: "warning",
                      });
                      if (confirmed) {
                        removeNode(item);
                      }
                    }}
                  />
                }
                label={`Unselect all of "${row.original.name}"`}
              />
            </div>
          );
        },
        meta: {
          sizeRatio: 5,
        },
      },
      {
        accessorKey: "name",
        id: "name",
        header: "Name",
        cell: ({ row }) => (
          <DataTable.CellContent
            icon={row.original.icon}
            className="select-none"
          >
            {row.original.disabled ? (
              <Tooltip
                label={DISABLED_REASON}
                trigger={
                  <div className="cursor-not-allowed text-muted-foreground dark:text-muted-foreground-night">
                    {row.original.name}
                  </div>
                }
              />
            ) : (
              <div className="font-semibold">{row.original.name}</div>
            )}
          </DataTable.CellContent>
        ),
        meta: {
          sizeRatio: 70,
        },
      },
    ],
    [confirm, isRowSelected, removeNode]
  );

  return (
    <ScrollableDataTable
      data={spaceRows}
      columns={columns}
      getRowId={(originalRow) => originalRow.id}
    />
  );
}
