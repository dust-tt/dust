import { Checkbox, DataTable, ScrollableDataTable } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";

import { useDataSourceBuilderContext } from "@app/components/data_source_view/context/DataSourceBuilderContext";
import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

type SpaceRowData = {
  id: string;
  icon: React.ComponentType;
  onClick: () => void;
} & Pick<SpaceType, "name" | "kind">;

export interface DataSourceSpaceSelectorProps {
  spaces: SpaceType[];
  allowedSpaces?: SpaceType[];
  onSelectSpace: (space: SpaceType) => void;
}

export function DataSourceSpaceSelector({
  spaces,
  allowedSpaces = [],
  onSelectSpace,
}: DataSourceSpaceSelectorProps) {
  const { selectNode, removeNode, isRowSelected, isRowSelectable } =
    useDataSourceBuilderContext();

  const spaceRows: SpaceRowData[] = spaces.map((space) => ({
    id: space.sId,
    name: space.name,
    kind: space.kind,
    icon: getSpaceIcon(space),
    onClick: () => onSelectSpace(space),
    disabled: allowedSpaces.find((s) => s.sId === space.sId) == null,
  }));

  const columns: ColumnDef<SpaceRowData>[] = useMemo(
    () => [
      {
        id: "select",
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => (
          <div className="flex h-full items-center">
            <Checkbox
              size="xs"
              checked={isRowSelected(row.original.id)}
              disabled={
                row.original.kind !== "global" &&
                !isRowSelectable(row.original.id)
              }
              onClick={(event) => event.stopPropagation()}
              onCheckedChange={(state) => {
                if (state === "indeterminate") {
                  removeNode(row.original.id);
                  return;
                }

                if (state) {
                  selectNode(row.original.id);
                } else {
                  removeNode(row.original.id);
                }
              }}
            />
          </div>
        ),
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
    [isRowSelectable, isRowSelected, removeNode, selectNode]
  );

  return (
    <ScrollableDataTable
      data={spaceRows}
      columns={columns}
      getRowId={(originalRow) => originalRow.id}
    />
  );
}
