import {
  Chip,
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

interface ConfirmDeleteSpaceDialogProps {
  space: SpaceType;
  handleDelete: () => void;
  dataSourceUsage?: string[];
  isOpen: boolean;
  isDeleting: boolean;
  onClose: () => void;
}

export function ConfirmDeleteSpaceDialog({
  space,
  handleDelete,
  dataSourceUsage,
  isOpen,
  isDeleting,
  onClose,
}: ConfirmDeleteSpaceDialogProps) {
  const spaceName = `"${getSpaceName(space)}"`;
  const hasAgents = dataSourceUsage && dataSourceUsage.length > 0;

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
                  title="This will break existing agents"
                >
                  {dataSourceUsage.length === 1 ? (
                    <>
                      Agent{" "}
                      <Chip size="sm" color="blue" label={dataSourceUsage[0]} />{" "}
                      currently uses this space and will be broken.
                    </>
                  ) : (
                    <>
                      The following agents will be broken:{" "}
                      {dataSourceUsage.map((agent, index) => (
                        <span key={agent}>
                          <Chip size="xs" color="primary" label={agent} />
                          {index < dataSourceUsage.length - 1 && ", "}
                        </span>
                      ))}
                    </>
                  )}
                </ContentMessage>
              )}

              <div>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to permanently delete space{" "}
                  <Chip size="xs" color="primary" label={spaceName} />?
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
