import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
} from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Leave this Pod?</Trans>
          </DialogTitle>
          <DialogDescription>
            {isRestricted ? (
              <Trans>
                You will no longer have access to conversations and context in{" "}
                <strong>{podName}</strong>.
              </Trans>
            ) : (
              <Trans>You can rejoin this Pod anytime.</Trans>
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
              label: t`Cancel`,
              variant: "outline",
            }}
            rightButtonProps={{
              label: t`Leave`,
              variant: "warning",
              onClick: onLeave,
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
