import { Dialog } from "@dust-tt/sparkle";
import type { SubscriptionType } from "@dust-tt/types";
import { useRouter } from "next/router";

import { isTrial } from "@app/lib/plans/trial";

function getUpsellDialogDetailsForFreeTrial() {
  return {
    title: "You’ve reach the Free Trial daily messages limit",
    validateLabel: "Skip trial & upgrade now",
    children: (
      <p className="text-sm font-normal text-element-800">
        Come back tomorrow for a fresh start or{" "}
        <span className="font-bold">skip the trial and start paying now.</span>
      </p>
    ),
  };
}

function getUpsellDialogDetailsForFreePlan() {
  return {
    title: "You’ve reach the messages limit",
    validateLabel: "Check Dust plans",
    children: (
      <p className="text-sm font-normal text-element-800">
        Looks like you've used up all your messages. Check out our paid plans to
        get unlimited messages.
      </p>
    ),
  };
}

export function ReachedLimitPopup({
  isOpened,
  onClose,
  subscription,
  workspaceId,
}: {
  isOpened: boolean;
  onClose: () => void;
  subscription: SubscriptionType;
  workspaceId: string;
}) {
  const router = useRouter();

  const { children, title, validateLabel } = isTrial(subscription)
    ? getUpsellDialogDetailsForFreeTrial()
    : getUpsellDialogDetailsForFreePlan();

  return (
    <Dialog
      isOpen={isOpened}
      title={title}
      onValidate={() => {
        void router.push(`/w/${workspaceId}/subscription`);
      }}
      onCancel={() => onClose()}
      cancelLabel="Close"
      validateLabel={validateLabel}
    >
      {children}
    </Dialog>
  );
}
