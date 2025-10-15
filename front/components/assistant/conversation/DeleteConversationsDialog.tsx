import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import React from "react";

type DeleteConversationsDialogProps = {
  isOpen: boolean;
  isDeleting?: boolean;
  onClose: () => void;
  onDelete: () => void;
  type: "all" | "selection";
  selectedCount?: number;
};

export const DeleteConversationsDialog = ({
  isOpen,
  isDeleting,
  onClose,
  onDelete,
  type,
  selectedCount,
}: DeleteConversationsDialogProps) => {
  const title =
    type === "all"
      ? "Clear conversation history"
      : `Delete conversation${selectedCount && selectedCount > 1 ? "s" : ""}`;

  const description =
    type === "all"
      ? "Are you sure you want to delete ALL conversations?"
      : `Are you sure you want to delete ${selectedCount} conversation${selectedCount && selectedCount > 1 ? "s" : ""}?`;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {isDeleting ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              <b>This action cannot be undone.</b>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
                autoFocus: true,
                onClick: async () => {
                  await onDelete();
                  onClose();
                },
              }}
            />
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
