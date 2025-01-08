import {
  NewDialog,
  NewDialogContainer,
  NewDialogContent,
  NewDialogDescription,
  NewDialogFooter,
  NewDialogHeader,
  NewDialogTitle,
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
    <NewDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <NewDialogContent>
        <NewDialogHeader>
          <NewDialogTitle>{title}</NewDialogTitle>
          <NewDialogDescription>{description}</NewDialogDescription>
        </NewDialogHeader>
        {isDeleting ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <NewDialogContainer>
              <b>This action cannot be undone.</b>
            </NewDialogContainer>
            <NewDialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Delete",
                variant: "warning",
                onClick: async () => {
                  await onDelete();
                  onClose();
                },
              }}
            />
          </>
        )}
      </NewDialogContent>
    </NewDialog>
  );
};
