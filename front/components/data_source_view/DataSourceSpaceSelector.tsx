import { Checkbox, DataTable, ScrollableDataTable } from "@dust-tt/sparkle";
import type { ColumnDef, RowSelectionState } from "@tanstack/react-table";
import { useMemo } from "react";
import { useFieldArray } from "react-hook-form";

import { getSpaceIcon } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

import type { DataSourceBuilderSelectorForm } from "./DataSourceBuilderSelector";

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
  const { fields, replace } = useFieldArray<
    DataSourceBuilderSelectorForm,
    "spaces"
  >({
    name: "spaces",
  });

  const spaceRows: SpaceRowData[] = spaces.map((space) => ({
    id: space.sId,
    name: space.name,
    icon: getSpaceIcon(space),
    onClick: () => onSelectSpace(space),
    disabled: allowedSpaces.find((s) => s.sId === space.sId) == null,
  }));

  const rowSelection = useMemo(() => {
    return fields.reduce(
      (acc, value) => {
        acc[value.sId] = true;
        return acc;
      },
      {} as Record<string, boolean>
    );
  }, [fields]);

  const setRowSelection = (state: RowSelectionState) => {
    // Transform the table selection state to the form
    const derivedState = Object.entries(state).reduce(
      (acc, [id, selected]) => {
        if (selected) {
          const space = spaces.find((s) => s.sId === id);
          if (space) {
            acc.push({
              sId: id,
              type: space?.kind === "global" ? "company" : "restricted",
              nodes: [],
            });
          }
        }
        return acc;
      },
      [] as DataSourceBuilderSelectorForm["spaces"]
    );

    replace(derivedState);
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
