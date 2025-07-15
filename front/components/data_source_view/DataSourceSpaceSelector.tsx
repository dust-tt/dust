import { Checkbox, DataTable, ScrollableDataTable } from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useMemo } from "react";

import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

import { useDataSourceBuilderContext } from "./DataSourceBuilderContext";

type SpaceRowData = {
  id: string;
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
  const { state, dispatch } = useDataSourceBuilderContext();

  const spaceRows: SpaceRowData[] = spaces.map((space) => ({
    id: space.sId,
    name: space.name,
    icon: getSpaceIcon(space),
    onClick: () => onSelectSpace(space),
    disabled: allowedSpaces.find((s) => s.sId === space.sId) == null,
  }));

  const rowSelection = useMemo(() => {
    const selection: Record<string, boolean> = {};
    for (const spaceId in state.spaces) {
      selection[spaceId] = true;
    }
    return selection;
  }, [state.spaces]);

  const setRowSelection = (state: RowSelectionState) => {
    // Transform the table selection state to the form
    const newSpaces: Record<string, SpaceType> = {};

    for (const [id, selected] of Object.entries(state)) {
      if (selected) {
        const space = spaces.find((s) => s.sId === id);
        if (space) {
          newSpaces[id] = space;
        }
      }
    }

    dispatch({ type: "set-spaces", payload: newSpaces });
  };

  return (
    <ScrollableDataTable
      data={spaceRows}
      columns={columns}
      enableRowSelection
      rowSelection={rowSelection}
      getRowId={(originalRow) => originalRow.id}
      setRowSelection={setRowSelection}
    />
  );
}
