import { Dialog, Page } from "@dust-tt/sparkle";
import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";
import { assertNever } from "@dust-tt/types";
import { useRouter } from "next/router";
import { useEffect } from "react";

import { getBrowserClient } from "@app/lib/amplitude/browser";
import { isTrial } from "@app/lib/plans/trial";

export type WorkspaceLimit =
  | "cant_invite_no_seats_available"
  | "cant_invite_free_plan"
  | "cant_invite_payment_failure"
  | "message_limit";

function getLimitPromptForCode(
  code: WorkspaceLimit,
  subscription: SubscriptionType
) {
  switch (code) {
    case "cant_invite_no_seats_available": {
      if (subscription.trialing) {
        return {
          title: "Fair usage limit reached",
          validateLabel: "Manage your subscription",
          children: (
            <Page.Vertical gap="lg">
              <Page.P>
                You can invite up to {subscription.plan.limits.users.maxUsers}{" "}
                members in during trial.
              </Page.P>
              <p className="text-sm font-bold text-element-800">
                You can end your trial and start paying now to invite more
                members.
              </p>
            </Page.Vertical>
          ),
        };
      } else {
        return {
          title: "Plan Limits",
          validateLabel: "Manage your subscription",
          children: (
            <>
              <Page.P>
                Workspace has reached its member limit. Please upgrade or remove
                inactive members to add more.
              </Page.P>
            </>
          ),
        };
      }
    }
    case "cant_invite_free_plan":
      return {
        title: "Free plan",
        validateLabel: "Manage your subscription",
        children: (
          <>
            <Page.P>
              You cannot invite other members with the free plan. Upgrade your
              plan for unlimited members.
            </Page.P>
          </>
        ),
      };
    case "cant_invite_payment_failure":
      return {
        title: "Failed payment",
        validateLabel: "Manage your subscription",
        children: (
          <>
            <Page.P>
              You cannot invite other members while your workspace has a failed
              payment.
            </Page.P>
          </>
        ),
      };

    case "message_limit": {
      if (subscription.trialing) {
        return {
          title: "Fair usage limit reached",
          validateLabel: "Manage your subscription",
          children: (
            <>
              <Page.P>
                We limit usage of Dust during the trial. You've reached your
                limit for today.
              </Page.P>
              <p className="text-sm font-normal text-element-800">
                Come back tomorrow for a fresh start or{" "}
                <span className="font-bold">
                  end your trial and start paying now.
                </span>
              </p>
            </>
          ),
        };
      } else {
        return {
          title: "You’ve reach the messages limit",
          validateLabel: "Check Dust plans",
          children: (
            <p className="text-sm font-normal text-element-800">
              Looks like you've used up all your messages. Check out our paid
              plans to get unlimited messages.
            </p>
          ),
        };
      }
    }

    default:
      assertNever(code);
  }
}

export function ReachedLimitPopup({
  isOpened,
  onClose,
  subscription,
  owner,
  code,
}: {
  isOpened: boolean;
  onClose: () => void;
  subscription: SubscriptionType;
  owner: WorkspaceType;
  code: WorkspaceLimit;
}) {
  const router = useRouter();
  const trialing = isTrial(subscription);
  const { title, children, validateLabel } = getLimitPromptForCode(
    code,
    subscription
  );

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
