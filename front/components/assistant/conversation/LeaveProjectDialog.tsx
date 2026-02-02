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

type LeaveProjectDialogProps = {
  isOpen: boolean;
  isLeaving?: boolean;
  onClose: () => void;
  onLeave: () => void;
};

export const LeaveProjectDialog = ({
  isLeaving,
  onLeave,
  onClose,
  isOpen,
}: LeaveProjectDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave project</DialogTitle>
          <DialogDescription>
            Are you sure you want to leave this project?
          </DialogDescription>
        </DialogHeader>
        {isLeaving ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              <b>You will no longer have access to this project.</b>
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
