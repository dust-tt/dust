import { DataTable } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";

import type { SpaceType } from "@app/types";

type SpaceRowData = {
  name: string;
  onClick: () => void;
};

const columns: ColumnDef<SpaceRowData>[] = [
  {
    accessorKey: "name",
    id: "name",
    header: "Name",
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
    onClick: () => onSelectSpace(space),
    disabled: allowedSpaces.find((s) => s.sId === space.sId) == null,
  }));

  return <DataTable data={spaceRows} columns={columns} />;
}
