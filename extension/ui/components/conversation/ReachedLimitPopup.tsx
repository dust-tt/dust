import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@dust-tt/sparkle";

export function ReachedLimitPopup({
  isOpened,
  onClose,
  isTrialing,
}: {
  isOpened: boolean;
  onClose: () => void;
  isTrialing: boolean;
}) {
  // TODO(ext): put a link to subscription page.
  if (isTrialing) {
    return (
      <Dialog
        open={isOpened}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fair usage limit reached</DialogTitle>
            <DialogDescription>
              We limit usage of Dust during the trial. You've reached your limit
              for today.
            </DialogDescription>
          </DialogHeader>
          <DialogContainer>
            <p className="text-sm font-normal text-element-800">
              Come back tomorrow for a fresh start or{" "}
              <span className="font-bold">
                end your trial and start paying now (using our website).
              </span>
            </p>
          </DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
              onClick: onClose,
            }}
            rightButtonProps={{
              label: "Ok",
              variant: "outline",
              onClick: onClose,
            }}
          />
        </DialogContent>
      </Dialog>
    );
  }

  // TODO(ext): put a link to fair use policy (modal).
  return (
    <Dialog
      open={isOpened}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Message quota exceeded</DialogTitle>
        </DialogHeader>
        <DialogContainer>
          <p className="text-sm font-normal text-element-800 dark:text-element-800-night">
            We've paused messaging for your workspace due to our fair usage
            policy. Your workspace has reached its shared limit of 100 messages
            per user for the past 24 hours. This total limit is collectively
            shared by all users in the workspace. Check our Fair Use policy on
            our website to learn more.
          </p>
        </DialogContainer>
        <DialogFooter
          leftButtonProps={{
            label: "Cancel",
            variant: "outline",
            onClick: onClose,
          }}
          rightButtonProps={{
            label: "Ok",
            variant: "outline",
            onClick: onClose,
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
