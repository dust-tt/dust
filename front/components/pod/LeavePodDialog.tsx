import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";

interface LeavePodDialogProps {
  isOpen: boolean;
  isLeaving?: boolean;
  isRestricted: boolean;
  onClose: () => void;
  onLeave: () => void;
  podName: string;
}

export const LeavePodDialog = ({
  isLeaving,
  isRestricted,
  onLeave,
  onClose,
  isOpen,
  podName,
}: LeavePodDialogProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Leave this Pod?</DialogTitle>
          <DialogDescription>
            {isRestricted ? (
              <>
                You will no longer have access to conversations and context in{" "}
                <strong>{podName}</strong>.
              </>
            ) : (
              "You can rejoin this Pod anytime."
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
