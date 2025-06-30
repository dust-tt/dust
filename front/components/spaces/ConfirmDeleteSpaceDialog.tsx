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
import type { SpaceCategoryInfo } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { SpaceType } from "@app/types";

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
  const uniqueAgentNames = spaceInfoByCategory
    ? [
        ...new Set(
          Object.values(spaceInfoByCategory)
            .flatMap((category) => category.usage.agents)
            .map((agent) => agent.name)
            .filter((name) => name && name.length > 0)
        ),
      ]
    : [];

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
                  title={`${uniqueAgentNames.length} agent(s) have tools that depend on this space and will be impacted by its deletion`}
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
