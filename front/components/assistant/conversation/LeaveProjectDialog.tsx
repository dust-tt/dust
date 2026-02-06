import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import React from "react";

interface LeaveProjectDialogProps {
  isOpen: boolean;
  isLeaving?: boolean;
  isRestricted: boolean;
  onClose: () => void;
  onLeave: () => void;
  spaceName: string;
}

export const LeaveProjectDialog = ({
  isLeaving,
  isRestricted,
  onLeave,
  onClose,
  isOpen,
  spaceName,
}: LeaveProjectDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave this project?</DialogTitle>
          <DialogDescription>
            {isRestricted ? (
              <>
                You will no longer have access to conversations and context in{" "}
                <strong>{spaceName}</strong>.
              </>
            ) : (
              "You can rejoin this project anytime."
            )}
          </DialogDescription>
        </DialogHeader>
        {isLeaving ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
            rightButtonProps={{
              label: "Leave",
              variant: "warning",
              onClick: onLeave,
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
