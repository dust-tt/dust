import { useSpacesContext } from "@app/components/agent_builder/SpacesContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import { useSpaceProjectsLookup } from "@app/lib/swr/spaces";
import type { PodType, SpaceType } from "@app/types/space";
import { isProjectType } from "@app/types/space";
import {
  Checkbox,
  cn,
  ListGroup,
  ListItem,
  ListItemSection,
  SearchInput,
  Sheet,
  SheetContainer,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Tooltip,
} from "@dust-tt/sparkle";
import type React from "react";
import { useCallback, useMemo, useState } from "react";

type SpaceRowData = {
  sId: string;
  name: string;
  description?: string;
  space: SpaceType | PodType;
  isSelected: boolean;
  isAlreadyRequested: boolean;
  isBlockedByPodLimit: boolean;
  onToggle: () => void;
  onClick?: () => void;
};

interface SpaceSelectionPageProps {
  alreadyRequestedSpaceIds: Set<string>;
  entityName?: "agent" | "skill";
  includeProjects?: boolean;
  selectedSpaces: string[];
  setSelectedSpaces: React.Dispatch<React.SetStateAction<string[]>>;
  searchQuery?: string;
  missingSpaceIds?: string[];
}

interface SpaceSelectionSheetProps
  extends Omit<SpaceSelectionPageProps, "searchQuery" | "entityName"> {
  entityName: "agent" | "skill";
  onClose: () => void;
  onSave: () => void;
  open: boolean;
}

export function SpaceSelectionSheet({
  alreadyRequestedSpaceIds,
  entityName,
  includeProjects = true,
  missingSpaceIds,
  onClose,
  onSave,
  open,
  selectedSpaces,
  setSelectedSpaces,
}: SpaceSelectionSheetProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const handleClose = () => {
    setSearchQuery("");
    onClose();
  };

  const handleSave = () => {
    setSearchQuery("");
    onSave();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) {
          handleClose();
        }
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Data and access</SheetTitle>
          <SheetDescription>
            Adding spaces or pods will make the data from each of them available
            to {entityName}.
          </SheetDescription>
          <SearchInput
            name="space"
            onChange={(query) => setSearchQuery(query)}
            value={searchQuery}
            placeholder="Search spaces and Pods"
            className="mt-4"
          />
        </SheetHeader>
        <SheetContainer isListSelector>
          <SpaceSelectionPageContent
            alreadyRequestedSpaceIds={alreadyRequestedSpaceIds}
            entityName={entityName}
            includeProjects={includeProjects}
            selectedSpaces={selectedSpaces}
            setSelectedSpaces={setSelectedSpaces}
            searchQuery={searchQuery}
            missingSpaceIds={missingSpaceIds}
          />
        </SheetContainer>
        <SheetFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: handleClose,
          }}
          rightButtonProps={{
            label: "Save",
            variant: "primary",
            onClick: handleSave,
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function SpaceSelectionPageContent({
  alreadyRequestedSpaceIds,
  entityName,
  includeProjects = true,
  selectedSpaces,
  setSelectedSpaces,
  searchQuery = "",
  missingSpaceIds = [],
}: SpaceSelectionPageProps) {
  const { spaces, owner } = useSpacesContext();
  const sendNotification = useSendNotification();
  const isPodLimitEnforced = entityName === "skill";
  const { spaces: missingSpaces } = useSpaceProjectsLookup({
    workspaceId: owner.sId,
    spaceIds: missingSpaceIds,
  });

  const allSpaces = useMemo(() => {
    return [...spaces, ...missingSpaces];
  }, [spaces, missingSpaces]);

  const selectableSpaces = useMemo(() => {
    return allSpaces
      .filter(
        (s) =>
          s.kind !== "global" &&
          (includeProjects || s.kind !== "project") &&
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
  }, [allSpaces, includeProjects, searchQuery]);

  const selectedSpaceIds = useMemo(
    () => new Set(selectedSpaces),
    [selectedSpaces]
  );

  const handleSpaceToggle = useCallback(
    (space: SpaceType | PodType) => {
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
          isBlockedByPodLimit: false,
          onToggle: () => handleSpaceToggle(space),
        };
      });
  }, [
    selectableSpaces,
    alreadyRequestedSpaceIds,
    selectedSpaceIds,
    handleSpaceToggle,
  ]);

  const selectedPodSpace = useMemo(() => {
    if (!isPodLimitEnforced) {
      return undefined;
    }
    return selectableSpaces.find(
      (s): s is PodType =>
        isProjectType(s) &&
        (selectedSpaceIds.has(s.sId) || alreadyRequestedSpaceIds.has(s.sId))
    );
  }, [
    isPodLimitEnforced,
    selectableSpaces,
    selectedSpaceIds,
    alreadyRequestedSpaceIds,
  ]);

  const handleBlockedPodClick = useCallback(() => {
    if (!selectedPodSpace) {
      return;
    }
    sendNotification({
      type: "warning",
      title: "Only one Pod allowed",
      description: `A skill can only be restricted to a single Pod. Remove "${getSpaceName(selectedPodSpace)}" first to pick a different one.`,
    });
  }, [selectedPodSpace, sendNotification]);

  const projectsTableData: SpaceRowData[] = useMemo(() => {
    return selectableSpaces
      .filter((s): s is PodType => isProjectType(s))
      .map((project) => {
        const isAlreadyRequested = alreadyRequestedSpaceIds.has(project.sId);
        const isSelected =
          selectedSpaceIds.has(project.sId) || isAlreadyRequested;
        const isBlockedByPodLimit =
          !isSelected &&
          selectedPodSpace !== undefined &&
          selectedPodSpace.sId !== project.sId;
        return {
          sId: project.sId,
          name: getSpaceName(project),
          description: project.description ?? undefined,
          space: project,
          isSelected,
          isAlreadyRequested,
          isBlockedByPodLimit,
          onToggle: () => handleSpaceToggle(project),
        };
      });
  }, [
    selectableSpaces,
    alreadyRequestedSpaceIds,
    selectedPodSpace,
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
                    row.isSelected ? "bg-primary-50" : "",
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
          <>
            <ListItemSection size="sm">Pods</ListItemSection>
            <ListGroup>
              {projectsTableData.map((row) => {
                const ProjectIcon = getSpaceIcon(row.space);
                const isLocked =
                  row.isAlreadyRequested || row.isBlockedByPodLimit;
                const rowContent = (
                  <ListItem
                    key={row.sId}
                    itemsAlignment="center"
                    onClick={
                      row.isAlreadyRequested
                        ? undefined
                        : row.isBlockedByPodLimit
                          ? handleBlockedPodClick
                          : row.onToggle
                    }
                    className={cn(
                      row.isSelected ? "bg-primary-50" : "",
                      isLocked
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
                      disabled={isLocked}
                      onClick={(e: React.MouseEvent) => {
                        e.stopPropagation();
                        if (row.isBlockedByPodLimit) {
                          handleBlockedPodClick();
                        }
                      }}
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

                if (row.isBlockedByPodLimit) {
                  return (
                    <Tooltip
                      key={row.sId}
                      label="A skill can only be restricted to a single Pod"
                      side="right"
                      trigger={rowContent}
                    />
                  );
                }

                return rowContent;
              })}
            </ListGroup>
          </>
        </div>
      ) : (
        <div className="py-4 text-center text-sm text-muted-foreground">
          {searchQuery.length > 0
            ? "No results found for your search"
            : "No spaces and Pods available"}
        </div>
      )}
    </div>
  );
}
