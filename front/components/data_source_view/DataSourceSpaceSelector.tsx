import {
  Checkbox,
  DataTable,
  ScrollableDataTable,
  Tooltip,
} from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useContext, useMemo } from "react";

import { ConfirmContext } from "@app/components/Confirm";
import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";
import { SPACE_KINDS } from "@app/types";

type SpaceRowData = SpaceType & {
  id: string;
  icon: React.ComponentType;
  onClick: () => void;
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
    .map((space) => ({
      ...space,
      id: space.sId,
      name: space.name,
      kind: space.kind,
      icon: getSpaceIcon(space),
      onClick: () => setSpaceEntry(space),
      disabled: allowedSpaces.find((s) => s.sId === space.sId) == null,
    }))
    .toSorted((a, b) => {
      // First, sort by kind according to the specified order
      const aKindIndex = SPACE_KINDS.indexOf(a.kind);
      const bKindIndex = SPACE_KINDS.indexOf(b.kind);

      // If kinds are different, sort by kind order
      if (aKindIndex !== bKindIndex) {
        return aKindIndex - bKindIndex;
      }

      // If kinds are the same, sort by name alphabetically
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

          return (
            <div className="flex h-full items-center">
              <Tooltip
                trigger={
                  <Checkbox
                    size="xs"
                    checked={selectionState}
                    disabled={selectionState !== "partial"}
                    onClick={(event) => event.stopPropagation()}
                    onCheckedChange={async () => {
                      const item: NavigationHistoryEntryType = {
                        type: "space",
                        space: row.original,
                      };

                      if (selectionState === "partial") {
                        const confirmed = await confirm({
                          title: "Are you sure?",
                          message: `Do you want to unselect all of "${row.original.name}"?`,
                          validateLabel: "Unselect all",
                          validateVariant: "warning",
                        });
                        if (confirmed) {
                          removeNode(item);
                        }
                      }
                    }}
                  />
                }
                label={
                  selectionState === "partial"
                    ? `Unselect all of "${row.original.name}"`
                    : "You cannot select the whole space"
                }
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
            className="font-semibold"
          >
            {row.original.name}
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
