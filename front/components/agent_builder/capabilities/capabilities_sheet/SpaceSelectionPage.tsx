import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import { useSpaceProjectsLookup } from "@app/lib/swr/spaces";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { ProjectType, SpaceType } from "@app/types/space";
import { isProjectType } from "@app/types/space";
import {
  Checkbox,
  cn,
  ListGroup,
  ListItem,
  ListItemSection,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useMemo } from "react";

type SpaceRowData = {
  sId: string;
  name: string;
  description?: string;
  space: SpaceType | ProjectType;
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
    (space: SpaceType | ProjectType) => {
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
      .filter((s): s is ProjectType => isProjectType(s))
      .map((project) => {
        const isAlreadyRequested = alreadyRequestedSpaceIds.has(project.sId);
        return {
          sId: project.sId,
          name: getSpaceName(project),
          description: project.description ?? undefined,
          space: project,
          isSelected: selectedSpaceIds.has(project.sId) || isAlreadyRequested,
          isAlreadyRequested,
          onToggle: () => handleSpaceToggle(project),
        };
      });
  }, [
    selectableSpaces,
    alreadyRequestedSpaceIds,
    selectedSpaceIds,
    handleSpaceToggle,
  ]);

  return (
    <div className="flex flex-col gap-4">
      {selectableSpaces.length > 0 ? (
        <div className="flex flex-col">
          <ListItemSection size="sm">Spaces</ListItemSection>
          <ListGroup>
            {spacesTableData.map((row) => {
              const SpaceIcon = getSpaceIcon(row.space);
              const rowContent = (
                <ListItem
                  key={row.sId}
                  itemsAlignment="center"
                  onClick={row.isAlreadyRequested ? undefined : row.onToggle}
                  className={cn(
                    row.isSelected
                      ? "bg-primary-50 dark:bg-primary-50-night"
                      : "",
                    row.isAlreadyRequested
                      ? "cursor-not-allowed opacity-60"
                      : "cursor-pointer"
                  )}
                >
                  <SpaceIcon className="w-5 h-5 min-w-5 min-h-5" />
                  <div className="flex min-w-0 flex-1 flex-col items-start">
                    <span className="heading-sm truncate max-w-full text-foreground">
                      {row.name}
                    </span>
                    <span className="truncate max-w-full text-xs text-muted-foreground">
                      {row.description}
                    </span>
                  </div>
                  <Checkbox
                    checked={row.isSelected}
                    onCheckedChange={row.onToggle}
                    disabled={row.isAlreadyRequested}
                    onClick={(e: React.MouseEvent) => e.stopPropagation()}
                  />
                </ListItem>
              );

              if (row.isAlreadyRequested) {
                return (
                  <Tooltip
                    key={row.sId}
                    label="Used by other resources"
                    side="right"
                    trigger={rowContent}
                  />
                );
              }

              return rowContent;
            })}
          </ListGroup>
          {isProjectsEnabled && (
            <>
              <ListItemSection size="sm">Projects</ListItemSection>
              <ListGroup>
                {projectsTableData.map((row) => {
                  const ProjectIcon = getSpaceIcon(row.space);
                  const rowContent = (
                    <ListItem
                      key={row.sId}
                      itemsAlignment="center"
                      onClick={
                        row.isAlreadyRequested ? undefined : row.onToggle
                      }
                      className={cn(
                        row.isSelected
                          ? "bg-primary-50 dark:bg-primary-50-night"
                          : "",
                        row.isAlreadyRequested
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer"
                      )}
                    >
                      <ProjectIcon className="w-5 h-5 min-w-5 min-h-5" />
                      <div className="flex min-w-0 flex-1 flex-col items-start">
                        <span className="heading-sm max-w-full truncate text-foreground">
                          {row.name}
                        </span>
                        <span className="truncate max-w-full text-xs text-muted-foreground">
                          {row.description}
                        </span>
                      </div>
                      <Checkbox
                        checked={row.isSelected}
                        onCheckedChange={row.onToggle}
                        disabled={row.isAlreadyRequested}
                        onClick={(e: React.MouseEvent) => e.stopPropagation()}
                      />
                    </ListItem>
                  );

                  if (row.isAlreadyRequested) {
                    return (
                      <Tooltip
                        key={row.sId}
                        label="Used by other resources"
                        side="right"
                        trigger={rowContent}
                      />
                    );
                  }

                  return rowContent;
                })}
              </ListGroup>
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
