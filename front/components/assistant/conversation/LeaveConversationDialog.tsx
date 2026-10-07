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
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Leave conversation</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Are you sure you want to leave this conversation?</Trans>
          </DialogDescription>
        </DialogHeader>
        {isLeaving ? (
          <div className="flex justify-center py-8">
            <Spinner variant="dark" size="md" />
          </div>
        ) : (
          <>
            <DialogContainer>
              <b>
                <Trans>
                  You will no longer have access to this conversation.
                </Trans>
              </b>
            </DialogContainer>
            <DialogFooter
              leftButtonProps={{
                label: t`Cancel`,
                variant: "outline",
              }}
              rightButtonProps={{
                label: t`Leave`,
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
