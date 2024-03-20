import { Dialog, Page } from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { getBrowserClient } from "@app/lib/amplitude/browser";
import { isTrial } from "@app/lib/plans/trial";

function getUpsellDialogDetailsForFreeTrial() {
  return {
    title: "Fair usage limit reached",
    validateLabel: "Manage your subscription",
    children: (
      <>
        <Page.Vertical gap="lg">
          <Page.P>
            We limit usage of Dust during the trial. You've reached your limit
            for today.
          </Page.P>
          <p className="text-sm font-normal text-element-800">
            Come back tomorrow for a fresh start or{" "}
            <span className="font-bold">
              end your trial and start paying now.
            </span>
          </p>
        </Page.Vertical>
      </>
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
  owner,
}: {
  isOpened: boolean;
  onClose: () => void;
  subscription: SubscriptionType;
  owner: WorkspaceType;
}) {
  const router = useRouter();
  const trialing = isTrial(subscription);

  const { children, title, validateLabel } = trialing
    ? getUpsellDialogDetailsForFreeTrial()
    : getUpsellDialogDetailsForFreePlan();

  useEffect(() => {
    if (isOpened) {
      const amplitude = getBrowserClient();
      amplitude.fairUsageDialogViewed({
        workspaceId: owner.sId,
        workspaceName: owner.name,
        trialing,
      });
      amplitude.flush();
    }
  }, [isOpened, owner.name, owner.sId, trialing]);

  return (
    <Dialog
      isOpen={isOpened}
      title={title}
      onValidate={() => {
        void router.push(`/w/${owner.sId}/subscription`);
      }}
      onCancel={() => onClose()}
      cancelLabel="Close"
      validateLabel={validateLabel}
    >
      {children}
    </Dialog>
  );
}
