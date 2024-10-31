import { Dialog, Page } from "@dust-tt/sparkle";

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
        title="Fair usage limit reached"
        isOpen={isOpened}
        onValidate={onClose}
        onCancel={onClose}
        validateLabel="Ok"
      >
        <Page.P>
          We limit usage of Dust during the trial. You've reached your limit for
          today.
        </Page.P>
        <p className="text-sm font-normal text-element-800">
          Come back tomorrow for a fresh start or{" "}
          <span className="font-bold">
            end your trial and start paying now (using our website).
          </span>
        </p>
      </Dialog>
    );
  }

  // TODO(ext): put a link to fair use policy (modal).
  return (
    <Dialog
      title="Message quota exceeded"
      isOpen={isOpened}
      onValidate={onClose}
      onCancel={onClose}
      validateLabel="Ok"
    >
      <p className="text-sm font-normal text-element-800">
        We've paused messaging for your workspace due to our fair usage policy.
        Your workspace has reached its shared limit of 100 messages per user for
        the past 24 hours. This total limit is collectively shared by all users
        in the workspace. Check our Fair Use policy on our website to learn
        more.
      </p>
    </Dialog>
  );
}
