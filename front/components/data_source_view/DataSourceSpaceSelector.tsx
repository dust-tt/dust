import { Checkbox, DataTable, ScrollableDataTable } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

type SpaceRowData = {
  name: string;
  icon: React.ComponentType;
  onClick: () => void;
};

const columns: ColumnDef<SpaceRowData>[] = [
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
      <div className="flex h-full items-center">
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
    accessorKey: "name",
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <DataTable.CellContent icon={row.original.icon} className="font-semibold">
        {row.original.name}
      </DataTable.CellContent>
    ),
    meta: {
      sizeRatio: 70,
    },
  },
];

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
  const spaceRows: SpaceRowData[] = spaces.map((space) => ({
    name: space.name,
    icon: getSpaceIcon(space),
    onClick: () => onSelectSpace(space),
    disabled: allowedSpaces.find((s) => s.sId === space.sId) == null,
  }));

  return <ScrollableDataTable data={spaceRows} columns={columns} />;
}
