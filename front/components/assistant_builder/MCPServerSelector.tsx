import {
  ActionEyeIcon,
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Label,
  RadioGroup,
  RadioGroupCustomItem,
  ScrollArea,
  ScrollBar,
  Separator,
  Spinner,
} from "@dust-tt/sparkle";
import React, { useMemo } from "react";

import { SpaceSelector } from "@app/components/assistant_builder/spaces/SpaceSelector";
import { getAvatar } from "@app/lib/actions/mcp_icons";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { useSpaces } from "@app/lib/swr/spaces";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import { asDisplayName } from "@app/types";

interface MCPServerSelectorProps {
  allowedSpaces: SpaceType[];
  handleServerSelection: (mcpServerView: MCPServerViewType) => void;
  mcpServerViews: MCPServerViewType[];
  owner: LightWorkspaceType;
  selectedMCPServerView: MCPServerViewType | null;
}

export function MCPServerSelector({
  owner,
  allowedSpaces,
  mcpServerViews,
  selectedMCPServerView,
  handleServerSelection,
}: MCPServerSelectorProps) {
  const { spaces, isSpacesLoading } = useSpaces({ workspaceId: owner.sId });
  const filteredSpaces = useMemo(
    () =>
      spaces.filter((space) =>
        mcpServerViews.some(
          (mcpServerView) => mcpServerView.spaceId === space.sId
        )
      ),
    [spaces, mcpServerViews]
  );

  const hasNoMCPServerViewsInAllowedSpaces = useMemo(() => {
    // No n^2 complexity.
    const allowedSet = new Set(allowedSpaces.map((space) => space.sId));
    return mcpServerViews.every(
      (mcpServerView) => !allowedSet.has(mcpServerView.spaceId)
    );
  }, [mcpServerViews, allowedSpaces]);

  return (
    <>
      <div className="flex-grow pt-4 text-sm font-semibold text-foreground dark:text-foreground-night">
        Pick a set of tools
      </div>
      {isSpacesLoading ? (
        <Spinner />
      ) : (
        <SpaceSelector
          spaces={filteredSpaces}
          allowedSpaces={allowedSpaces}
          defaultSpace={
            selectedMCPServerView
              ? selectedMCPServerView.spaceId
              : allowedSpaces[0].sId
          }
          renderChildren={(space) => {
            const mcpServerViewsInSpace = space
              ? mcpServerViews.filter(
                  (mcpServerView) => mcpServerView.spaceId === space.sId
                )
              : mcpServerViews;
            if (
              mcpServerViewsInSpace.length === 0 ||
              hasNoMCPServerViewsInAllowedSpaces
            ) {
              return <>No tools available.</>;
            }

            return (
              <RadioGroup defaultValue={selectedMCPServerView?.id}>
                {mcpServerViewsInSpace
                  // Default servers can be added as capabilities or in the first level of the "Add tools" list
                  .filter((view) => !view.server.isDefault)
                  .map((mcpServerView, idx, arr) => (
                    <React.Fragment key={mcpServerView.id}>
                      <div className="flex w-full flex-row items-center justify-between gap-2">
                        <RadioGroupCustomItem
                          value={mcpServerView.id}
                          id={mcpServerView.id}
                          iconPosition="start"
                          customItem={
                            <Label
                              htmlFor={mcpServerView.id}
                              className="font-normal"
                            >
                              <Card
                                variant="tertiary"
                                size="sm"
                                onClick={() => {
                                  handleServerSelection(mcpServerView);
                                }}
                              >
                                <div className="flex flex-row items-center gap-2">
                                  {getAvatar(mcpServerView.server)}
                                  <div className="flex flex-grow items-center justify-between overflow-hidden truncate">
                                    <div className="flex flex-col gap-1">
                                      <div className="text-sm font-semibold text-foreground dark:text-foreground-night">
                                        {asDisplayName(
                                          mcpServerView.server.name
                                        )}
                                      </div>
                                      <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
                                        {mcpServerView.server.description}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </Card>
                            </Label>
                          }
                          onClick={() => {
                            handleServerSelection(mcpServerView);
                          }}
                        />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="outline"
                              size="xs"
                              isSelect
                              icon={ActionEyeIcon}
                            />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <ScrollArea
                              hideScrollBar
                              className="flex max-h-96 w-96 flex-col"
                            >
                              {mcpServerView.server.tools.map((tool) => (
                                <DropdownMenuItem key={tool.name}>
                                  <div className="flex flex-col gap-1">
                                    <p className="text-sm font-semibold text-foreground dark:text-foreground-night">
                                      {tool.name}
                                    </p>
                                    <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                                      {tool.description}
                                    </p>
                                  </div>
                                </DropdownMenuItem>
                              ))}
                              <ScrollBar className="py-0" />
                            </ScrollArea>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {idx !== arr.length - 1 && <Separator />}
                    </React.Fragment>
                  ))}
              </RadioGroup>
            );
          }}
        />
      )}
    </>
  );
}
