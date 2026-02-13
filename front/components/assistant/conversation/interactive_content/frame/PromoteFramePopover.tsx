import {
  ArrowUpOnSquareIcon,
  Button,
  ContentMessage,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  FolderIcon,
  InformationCircleIcon,
  Label,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Spinner,
} from "@dust-tt/sparkle";
import React from "react";

import { useFrameDependencies } from "@app/hooks/useFrameDependencies";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getSpaceIcon, getSpaceName } from "@app/lib/spaces";
import { useSpaces } from "@app/lib/swr/spaces";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";

interface SpaceDropdownProps {
  spaces: SpaceType[];
  selectedSpace: SpaceType | null;
  onSpaceChange: (space: SpaceType) => void;
  disabled?: boolean;
}

function SpaceDropdown({
  spaces,
  selectedSpace,
  onSpaceChange,
  disabled = false,
}: SpaceDropdownProps) {
  // Filter to only show regular/project spaces
  // Permission checking will be done server-side
  const writableSpaces = spaces.filter(
    (space) => space.kind === "regular" || space.kind === "project"
  );

  return (
    <div className="flex flex-col gap-2">
      <Label className="text-sm font-semibold text-primary dark:text-primary-night">
        Save to project
      </Label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            isSelect
            label={
              selectedSpace ? getSpaceName(selectedSpace) : "Select project"
            }
            icon={selectedSpace ? getSpaceIcon(selectedSpace) : FolderIcon}
            disabled={disabled}
            className="grid grid-cols-[auto_1fr_auto] truncate"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="max-h-64 w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto">
          {writableSpaces.length === 0 ? (
            <div className="p-2 text-sm text-muted-foreground">
              No writable projects available
            </div>
          ) : (
            writableSpaces.map((space) => (
              <DropdownMenuItem
                key={space.sId}
                label={getSpaceName(space)}
                onClick={() => onSpaceChange(space)}
                truncateText
                icon={getSpaceIcon(space)}
              />
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PromoteFramePopoverProps {
  fileId: string;
  owner: LightWorkspaceType;
  fileContent: string | null;
}

export function PromoteFramePopover({
  fileId,
  owner,
  fileContent,
}: PromoteFramePopoverProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isPromoting, setIsPromoting] = React.useState(false);
  const [selectedSpace, setSelectedSpace] = React.useState<SpaceType | null>(
    null
  );

  const sendNotification = useSendNotification();
  const { spaces, isSpacesLoading } = useSpaces({
    workspaceId: owner.sId,
    kinds: ["regular", "project"],
  });
  const { dependencies, isLoading: isDependenciesLoading } =
    useFrameDependencies({
      owner,
      fileId,
      frameContent: fileContent,
    });

  const handlePromote = async () => {
    if (!selectedSpace) {
      return;
    }

    setIsPromoting(true);
    try {
      const response = await clientFetch(
        `/api/w/${owner.sId}/files/${fileId}/promote`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ spaceId: selectedSpace.sId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.error?.message ?? "Failed to save frame to project"
        );
      }

      await response.json();

      sendNotification({
        type: "success",
        title: "Frame saved to project",
        description: `Successfully saved frame${dependencies.length > 0 ? ` and ${dependencies.length} file(s)` : ""} to ${getSpaceName(selectedSpace)}`,
      });

      setIsOpen(false);
      setSelectedSpace(null);
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Failed to save frame",
        description:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred",
      });
    } finally {
      setIsPromoting(false);
    }
  };

  const totalSize = dependencies.reduce((sum, dep) => sum + dep.fileSize, 0);

  return (
    <PopoverRoot open={isOpen} onOpenChange={setIsOpen} modal={true}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          label="Save to Project"
          icon={ArrowUpOnSquareIcon}
        />
      </PopoverTrigger>
      <PopoverContent className="flex w-96 flex-col" align="end">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-base font-semibold text-primary dark:text-primary-night">
              Save Frame to Company Data
            </h2>
            <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              Make this frame searchable and accessible to all project members
            </p>
          </div>

          {isSpacesLoading ? (
            <div className="flex h-full items-center justify-center py-8">
              <Spinner size="sm" />
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <SpaceDropdown
                spaces={spaces || []}
                selectedSpace={selectedSpace}
                onSpaceChange={setSelectedSpace}
                disabled={isPromoting}
              />

              {/* Dependencies preview */}
              {!isDependenciesLoading && dependencies.length > 0 && (
                <ContentMessage
                  variant="primary"
                  icon={InformationCircleIcon}
                  className="text-sm"
                >
                  <div>
                    <p className="font-medium">
                      This frame uses {dependencies.length} file(s):
                    </p>
                    <ul className="mt-2 space-y-1 text-sm">
                      {dependencies.slice(0, 5).map((dep) => (
                        <li key={dep.sId} className="truncate">
                          • {dep.fileName} ({formatFileSize(dep.fileSize)})
                        </li>
                      ))}
                      {dependencies.length > 5 && (
                        <li className="text-muted-foreground">
                          ... and {dependencies.length - 5} more
                        </li>
                      )}
                    </ul>
                    {totalSize > 0 && (
                      <p className="mt-2 text-sm text-muted-foreground">
                        Total size: {formatFileSize(totalSize)}
                      </p>
                    )}
                    <p className="mt-2 text-sm text-muted-foreground">
                      All files will be moved to the project.
                    </p>
                  </div>
                </ContentMessage>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="ghost"
                  label="Cancel"
                  onClick={() => setIsOpen(false)}
                  disabled={isPromoting}
                />
                <Button
                  variant="primary"
                  label={isPromoting ? "Saving..." : "Save to Project"}
                  onClick={handlePromote}
                  disabled={!selectedSpace || isPromoting}
                />
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
