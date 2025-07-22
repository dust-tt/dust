import { Checkbox, DataTable, ScrollableDataTable } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

import { useDataSourceBuilderContext } from "./DataSourceBuilderContext";

type SpaceRowData = {
  id: string;
  name: string;
  icon: React.ComponentType;
  onClick: () => void;
};

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
  const { addNode, removeNode, isSelected } = useDataSourceBuilderContext();

  const spaceRows: SpaceRowData[] = spaces.map((space) => ({
    id: space.sId,
    name: space.name,
    icon: getSpaceIcon(space),
    onClick: () => onSelectSpace(space),
    disabled: allowedSpaces.find((s) => s.sId === space.sId) == null,
  }));

  const columns: ColumnDef<SpaceRowData>[] = [
    {
      id: "select",
      enableSorting: false,
      enableHiding: false,
      header: () => (
        <Checkbox
          size="xs"
          onClick={(event) => event.stopPropagation()}
          onCheckedChange={(state) => {
            if (state === "indeterminate") {
              return;
            }
            if (state) {
              addNode(["root"]);
            } else {
              removeNode(["root"]);
            }
          }}
        />
      ),
      cell: ({ row }) => (
        <div className="flex h-full items-center">
          <Checkbox
            size="xs"
            checked={isSelected(["root", row.original.id])}
            disabled={!row.getCanSelect()}
            onClick={(event) => event.stopPropagation()}
            onCheckedChange={(state) => {
              if (state === "indeterminate") {
                return;
              }
              if (state) {
                addNode(["root", row.original.id]);
              } else {
                removeNode(["root", row.original.id]);
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
  ];

  return (
    <ScrollableDataTable
      data={spaceRows}
      columns={columns}
      getRowId={(originalRow) => originalRow.id}
    />
  );
}
