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

type LeaveConversationDialogProps = {
  isOpen: boolean;
  isLeaving?: boolean;
  onClose: () => void;
  onLeave: () => void;
};

export const LeaveConversationDialog = ({
  isLeaving,
  onLeave,
  onClose,
  isOpen,
}: LeaveConversationDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave conversation</DialogTitle>
          <DialogDescription>
            Are you sure you want to leave this conversation?
          </DialogDescription>
        </DialogHeader>
        {isLeaving ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              <b>You will no longer have access to this conversation.</b>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: "Cancel",
                variant: "outline",
              }}
              rightButtonProps={{
                label: "Leave",
                onClick: async () => {
                  await onLeave();
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
