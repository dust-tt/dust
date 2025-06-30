import {
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";

import { getSpaceName } from "@app/lib/spaces";
import type { SpaceType } from "@app/types";
import { SpaceCategoryInfo } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import { useMemo } from "react";

interface ConfirmDeleteSpaceDialogProps {
  space: SpaceType;
  handleDelete: () => void;
  spaceInfoByCategory: { [key: string]: SpaceCategoryInfo } | undefined;
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
}

export function ConfirmDeleteSpaceDialog({
  space,
  handleDelete,
  spaceInfoByCategory,
  isOpen,
  isDeleting,
  onClose,
}: ConfirmDeleteSpaceDialogProps) {
  const uniqueAgentNames = useMemo(() => {
    if (!spaceInfoByCategory) {
      return [];
    }

    const allAgentNames = Object.values(spaceInfoByCategory)
      .flatMap((category) => category.usage.agents)
      .map((agent) => agent.name)
      .filter((name) => name && name.length > 0);

    return [...new Set(allAgentNames)];
  }, [spaceInfoByCategory]);

  const spaceName = `${getSpaceName(space)}`;
  const hasAgents = uniqueAgentNames.length > 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{`Deleting ${getSpaceName(space)}`}</DialogTitle>
        </DialogHeader>
        {isDeleting ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer className="space-y-4">
              {hasAgents && (
                <ContentMessage
                  variant="warning"
                  // TODO: change to show names of public agents and then number of unpublished agents
                  title={`This will break ${uniqueAgentNames.length} existing agent(s)`}
                />
              )}
              <div>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to permanently delete space {spaceName}?
                  {hasAgents && " This action cannot be undone."}
                </p>
              </div>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
                onClick: async () => {
                  void handleDelete();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
