import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import type { SpaceType } from "@dust-tt/types";

import { getSpaceName } from "@app/lib/spaces";

interface ConfirmDeleteSpaceDialogProps {
  space: SpaceType;
  handleDelete: () => void;
  dataSourceUsage?: number;
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
  const message =
    dataSourceUsage === undefined
      ? `Are you sure you want to permanently delete space ${getSpaceName(space)}?`
      : dataSourceUsage > 0
        ? `${dataSourceUsage} agents currently use space ${getSpaceName(space)}. Are you sure you want to delete?`
        : `No agents are using this ${getSpaceName(space)}. Confirm permanent deletion?`;

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
            <DialogContainer>{message}</DialogContainer>
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
