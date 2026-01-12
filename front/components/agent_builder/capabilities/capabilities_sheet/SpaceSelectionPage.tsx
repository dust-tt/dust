import { Checkbox, DataTable, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useCallback, useMemo } from "react";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";

type SpaceRowData = {
  sId: string;
  name: string;
  space: SpaceType;
  isSelected: boolean;
  isAlreadyRequested: boolean;
  onToggle: () => void;
  onClick?: () => void;
};

interface SpaceSelectionPageProps {
  alreadyRequestedSpaceIds: Set<string>;
  selectedSpaces: string[];
  setSelectedSpaces: React.Dispatch<React.SetStateAction<string[]>>;
}

export function SpaceSelectionPageContent({
  alreadyRequestedSpaceIds,
  selectedSpaces,
  setSelectedSpaces,
}: SpaceSelectionPageProps) {
  const { spaces } = useSpacesContext();

  const selectableSpaces = useMemo(() => {
    return spaces.filter((s) => s.kind !== "global");
  }, [spaces]);

  const selectedSpaceIds = useMemo(
    () => new Set(selectedSpaces),
    [selectedSpaces]
  );

  const handleSpaceToggle = useCallback(
    (space: SpaceType) => {
      setSelectedSpaces((prev) => {
        const newSpaces = prev.includes(space.sId)
          ? prev.filter((id) => id !== space.sId)
          : [...prev, space.sId];
        return newSpaces;
      });
    },
    [setSelectedSpaces]
  );

  const tableData: SpaceRowData[] = useMemo(() => {
    return selectableSpaces.map((space) => {
      const isAlreadyRequested = alreadyRequestedSpaceIds.has(space.sId);
      return {
        sId: space.sId,
        name: getSpaceName(space),
        space,
        isSelected: selectedSpaceIds.has(space.sId) || isAlreadyRequested,
        isAlreadyRequested,
        onToggle: () => handleSpaceToggle(space),
      };
    });
  }, [
    selectableSpaces,
    alreadyRequestedSpaceIds,
    selectedSpaceIds,
    handleSpaceToggle,
  ]);

  const columns: ColumnDef<SpaceRowData>[] = useMemo(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const SpaceIcon = getSpaceIcon(row.original.space);
          const cellContent = (
            <DataTable.CellContent
              onClick={
                row.original.isAlreadyRequested
                  ? undefined
                  : row.original.onToggle
              }
            >
              <div
                className={`flex items-center gap-3 ${
                  row.original.isAlreadyRequested
                    ? "cursor-not-allowed opacity-60"
                    : "cursor-pointer"
                }`}
              >
                <Checkbox
                  checked={row.original.isSelected}
                  disabled={row.original.isAlreadyRequested}
                  onCheckedChange={row.original.onToggle}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  size="xs"
                />
                <SpaceIcon className="h-4 w-4 text-muted-foreground dark:text-muted-foreground-night" />
                <span>{row.original.name}</span>
              </div>
            </DataTable.CellContent>
          );

          if (row.original.isAlreadyRequested) {
            return (
              <Tooltip
                label="Used by other resources"
                side="right"
                trigger={cellContent}
              />
            );
          }

          return cellContent;
        },
        meta: {
          sizeRatio: 100,
        },
      },
    ],
    []
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
        Select spaces
      </p>
      {selectableSpaces.length > 0 ? (
        <DataTable
          data={tableData}
          columns={columns}
          sorting={[{ id: "name", desc: false }]}
        />
      ) : (
        <div className="py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
          No spaces available
        </div>
      )}
    </div>
  );
}
