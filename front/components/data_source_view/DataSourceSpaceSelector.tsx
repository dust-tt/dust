import { DataTable } from "@dust-tt/sparkle";
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
    accessorKey: "name",
    id: "name",
    header: "Name",
    cell: ({ row }) => (
      <DataTable.CellContent icon={row.original.icon}>
        {row.original.name}
      </DataTable.CellContent>
    ),
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

  return <DataTable data={spaceRows} columns={columns} />;
}
