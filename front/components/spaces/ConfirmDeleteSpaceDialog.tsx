import {
  Button,
  ContentMessage,
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Spinner,
  TrashIcon,
} from "@dust-tt/sparkle";

import { getSpaceName } from "@app/lib/spaces";
import type { SpaceCategoryInfo } from "@app/pages/api/w/[wId]/spaces/[spaceId]";
import type { SpaceType } from "@app/types";

interface ConfirmDeleteSpaceDialogProps {
  space: SpaceType;
  handleDelete: () => void;
  spaceInfoByCategory: { [key: string]: SpaceCategoryInfo } | undefined;
  isDeleting: boolean;
}

export function ConfirmDeleteSpaceDialog({
  space,
  handleDelete,
  spaceInfoByCategory,
  isDeleting,
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
    <Dialog>
      <DialogTrigger asChild>
        <div className="flex w-full flex-col items-end">
          <Button
            icon={TrashIcon}
            size="xs"
            variant="warning"
            label="Delete space"
          />
        </div>
      </DialogTrigger>
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
                  title={`${uniqueAgentNames.length} agent${uniqueAgentNames.length === 1 ? "" : "s"} 
                    use${uniqueAgentNames.length === 1 ? "s" : ""} tools that depend on this space 
                    and will be impacted by its deletion`}
                />
              )}
              <div>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to permanently delete space {spaceName}?
                  This action cannot be undone.
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
