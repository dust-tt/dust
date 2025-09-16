import {
  Dialog,
  DialogContainer,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Hoverable,
  Page,
} from "@dust-tt/sparkle";
import type { NextRouter } from "next/router";
import { useRouter } from "next/router";
import { useState } from "react";

import { FairUsageModal } from "@app/components/FairUsageModal";
import type { SubscriptionType, WorkspaceType } from "@app/types";
import { assertNever } from "@app/types";

export type WorkspaceLimit =
  | "cant_invite_no_seats_available"
  | "cant_invite_free_plan"
  | "cant_invite_payment_failure"
  | "message_limit";

function getLimitPromptForCode(
  router: NextRouter,
  owner: WorkspaceType,
  code: WorkspaceLimit,
  subscription: SubscriptionType,
  displayFairUseModal: () => void
) {
  switch (code) {
    case "cant_invite_no_seats_available": {
      if (subscription.trialing) {
        return {
          title: "Fair usage limit reached",
          validateLabel: "Manage your subscription",
          onValidate: () => {
            void router.push(`/w/${owner.sId}/subscription`);
          },
          children: (
            <Page.Vertical gap="lg">
              <Page.P>
                You can invite up to {subscription.plan.limits.users.maxUsers}{" "}
                members in during trial.
              </Page.P>
              <p className="text-sm font-bold text-muted-foreground dark:text-muted-foreground-night">
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
          onValidate: () => {
            void router.push(`/w/${owner.sId}/subscription`);
          },
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
        onValidate: () => {
          void router.push(`/w/${owner.sId}/subscription`);
        },
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
        onValidate: () => {
          void router.push(`/w/${owner.sId}/subscription`);
        },
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
          onValidate: () => {
            void router.push(`/w/${owner.sId}/subscription`);
          },
          children: (
            <>
              <Page.P>
                We limit usage of Dust during the trial. You've reached your
                limit for today.
              </Page.P>
              <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
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
          title: "Message quota exceeded",
          validateLabel: "Ok",
          children: (
            <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
              We've paused messaging for your workspace due to our fair usage
              policy. Your workspace has reached its shared limit of 100
              messages per user for the past 24 hours. This total limit is
              collectively shared by all users in the workspace. Check our{" "}
              <Hoverable
                variant="highlight"
                onClick={() => displayFairUseModal()}
              >
                Fair Use policy
              </Hoverable>{" "}
              to learn more.
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
  const [isFairUsageModalOpened, setIsFairUsageModalOpened] = useState(false);

  const router = useRouter();
  const { title, children, validateLabel, onValidate } = getLimitPromptForCode(
    router,
    owner,
    code,
    subscription,
    () => setIsFairUsageModalOpened(true)
  );

  return (
    <>
      <FairUsageModal
        isOpened={isFairUsageModalOpened}
        onClose={() => setIsFairUsageModalOpened(false)}
      />
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
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <DialogContainer>{children}</DialogContainer>
          <DialogFooter
            leftButtonProps={{
              label: "Cancel",
              variant: "outline",
            }}
            rightButtonProps={{
              label: validateLabel,
              variant: "highlight",
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
              onClick: onValidate || (() => onClose()),
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
