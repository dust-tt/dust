import { Checkbox, cn, DataTable, Tooltip } from "@dust-tt/sparkle";
import type { ColumnDef } from "@tanstack/react-table";
import React, { useCallback, useMemo } from "react";

import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import { useSpaceProjectsLookup } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SpaceType } from "@app/types/space";

type SpaceRowData = {
  sId: string;
  name: string;
  description?: string;
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
  searchQuery?: string;
  missingSpaceIds?: string[];
}

export function SpaceSelectionPageContent({
  alreadyRequestedSpaceIds,
  selectedSpaces,
  setSelectedSpaces,
  searchQuery = "",
  missingSpaceIds = [],
}: SpaceSelectionPageProps) {
  const { spaces, owner } = useSpacesContext();
  const { spaces: missingSpaces } = useSpaceProjectsLookup({
    workspaceId: owner.sId,
    spaceIds: missingSpaceIds,
  });

  const allSpaces = useMemo(() => {
    return [...spaces, ...missingSpaces];
  }, [spaces, missingSpaces]);

  const { hasFeature } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isProjectsEnabled = hasFeature("projects");

  const selectableSpaces = useMemo(() => {
    return allSpaces
      .filter(
        (s) =>
          s.kind !== "global" &&
          s.name.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .sort((a, b) => {
        // Public spaces first, then alphabetically
        if (a.isRestricted && !b.isRestricted) {
          return 1;
        }
        if (!a.isRestricted && b.isRestricted) {
          return -1;
        }
        return getSpaceName(a).localeCompare(getSpaceName(b));
      });
  }, [allSpaces, searchQuery]);

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

  const spacesTableData: SpaceRowData[] = useMemo(() => {
    return selectableSpaces
      .filter((space) => space.kind !== "project")
      .map((space) => {
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

  const projectsTableData: SpaceRowData[] = useMemo(() => {
    return selectableSpaces
      .filter((s) => s.kind === "project")
      .map((space) => {
        const isAlreadyRequested = alreadyRequestedSpaceIds.has(space.sId);
        return {
          sId: space.sId,
          name: getSpaceName(space),
          description: space.description,
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
        cell: ({ row }) => {
          const SpaceIcon = getSpaceIcon(row.original.space);
          const cellContent = (
            <DataTable.CellContent
              onClick={
                row.original.isAlreadyRequested
                  ? undefined
                  : row.original.onToggle
              }
              grow
              className={cn(
                "p-3 hover:bg-muted-background dark:hover:bg-muted-background-night active:bg-primary-100 dark:active:bg-primary-100-night",
                row.original.isAlreadyRequested
                  ? "cursor-not-allowed opacity-60"
                  : "cursor-pointer"
              )}
            >
              <div className="flex flex-row items-center justify-between gap-3">
                <div className="flex flex-row items-center gap-3 min-w-0">
                  <SpaceIcon className="h-5 w-5 min-h-5 min-w-5 text-muted-foreground dark:text-muted-foreground-night" />
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-medium text-foreground dark:text-foreground-night truncate">
                      {row.original.name}
                    </span>
                    <span className="text-xs text-muted-foreground dark:text-muted-foreground-night truncate">
                      {row.original.description}
                    </span>
                  </div>
                </div>
                <Checkbox
                  checked={row.original.isSelected}
                  disabled={row.original.isAlreadyRequested}
                  onCheckedChange={row.original.onToggle}
                  onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  size="sm"
                />
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
      {selectableSpaces.length > 0 ? (
        <div className="flex flex-col">
          <div className="heading-sm bg-muted-background p-2 dark:bg-muted-background-night/50 text-foreground dark:text-foreground-night">
            Spaces
          </div>
          <DataTable
            data={spacesTableData}
            columns={columns}
            className="[&_thead]:hidden [&_td]:pl-0"
          />
          {isProjectsEnabled && (
            <>
              <div className="heading-sm bg-muted-background p-2 dark:bg-muted-background-night/50 text-foreground dark:text-foreground-night">
                Projects
              </div>
              <DataTable
                data={projectsTableData}
                columns={columns}
                className="[&_thead]:hidden [&_td]:pl-0"
              />
            </>
          )}
        </div>
      ) : (
        <div className="py-4 text-center text-sm text-muted-foreground dark:text-muted-foreground-night">
          {searchQuery.length > 0
            ? "No results found for your search"
            : "No spaces and projects available"}
        </div>
      )}
    </div>
  );
}
