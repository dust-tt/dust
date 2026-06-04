import { FairUsageModal } from "@app/components/FairUsageModal";
import { isFreeTrialPhonePlan } from "@app/lib/plans/plan_codes";
import type { AppRouter } from "@app/lib/platform";
import { useAppRouter } from "@app/lib/platform";
import type { SubscriptionType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { WorkspaceType } from "@app/types/user";
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
import { useState } from "react";

export type WorkspaceLimit =
  | "cant_invite_no_seats_available"
  | "cant_invite_free_plan"
  | "cant_invite_payment_failure"
  | "message_limit"
  | "credits_exhausted"
  | "pool_credits_exhausted"
  | "user_credits_exhausted"
  | "no_seat";

function getLimitPromptForCode(
  router: AppRouter,
  owner: WorkspaceType,
  code: WorkspaceLimit,
  subscription: SubscriptionType,
  displayFairUseModal: () => void,
  isAdmin: boolean
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
                You can invite up to {subscription.plan.limits.users.maxUsers}
                &nbsp;members in during trial.
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
      if (isFreeTrialPhonePlan(subscription.plan.code)) {
        return {
          title: "Dust trial message limit reached",
          validateLabel: isAdmin ? "Subscribe to Dust" : "Ok",
          onValidate: isAdmin
            ? () => {
                void router.push(`/w/${owner.sId}/subscription`);
              }
            : undefined,
          children: (
            <>
              <Page.P>
                You have reached the message limit under the trial. You can
                subscribe to a paid plan to continue using Dust.
              </Page.P>
            </>
          ),
        };
      } else if (subscription.trialing) {
        return {
          title: "Fair usage limit reached",
          validateLabel: isAdmin ? "Manage your subscription" : "Ok",
          onValidate: isAdmin
            ? () => {
                void router.push(`/w/${owner.sId}/subscription`);
              }
            : undefined,
          children: (
            <>
              <Page.P>
                We limit usage of Dust during the trial. You've reached your
                limit for today.
              </Page.P>
              <p className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
                Come back tomorrow for a fresh start or&nbsp;
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
              policy. Your workspace has reached its shared limit of{" "}
              {subscription.plan.limits.assistant.maxMessages} messages per user
              over the past 24 hours. This total limit is collectively shared by
              all users in the workspace. Check our{" "}
              <Hoverable
                variant="highlight"
                onClick={() => displayFairUseModal()}
              >
                Fair Use policy
              </Hoverable>
              &nbsp; to learn more.
            </p>
          ),
        };
      }
    }

    case "credits_exhausted":
    case "pool_credits_exhausted": {
      const creditsManagementHref = isCreditPricedPlan(subscription.plan)
        ? `/w/${owner.sId}/usage`
        : `/w/${owner.sId}/developers/credits-usage`;
      return {
        title: "Workspace out of credits",
        validateLabel: isAdmin ? "Manage credits" : "Ok",
        onValidate: isAdmin
          ? () => {
              void router.push(creditsManagementHref);
            }
          : undefined,
        children: (
          <>
            <Page.P>
              {isAdmin
                ? "Your workspace has run out of credits. Please purchase more credits to continue using Dust."
                : "Your workspace has run out of credits. Please contact your administrator to purchase more credits."}
            </Page.P>
          </>
        ),
      };
    }

    case "no_seat": {
      return {
        title: "No seat assigned",
        validateLabel: "Ok",
        children: (
          <>
            <Page.P>
              You don&apos;t have a seat assigned in this workspace. Please
              contact your administrator to assign you one.
            </Page.P>
          </>
        ),
      };
    }

    case "user_credits_exhausted": {
      return {
        title: "Usage cap reached",
        validateLabel: isAdmin ? "Go to Usage" : "Ok",
        onValidate: isAdmin
          ? () => {
              void router.push(`/w/${owner.sId}/usage`);
            }
          : undefined,
        children: (
          <>
            <Page.P>
              {isAdmin
                ? "You have reached your personal usage cap. You can adjust user caps from the usage page."
                : "You have reached your personal usage cap. Please contact your administrator to increase it."}
            </Page.P>
          </>
        ),
      };
    }

    default:
      assertNeverAndIgnore(code);
      return undefined;
  }
}

export function ReachedLimitPopup({
  isAdmin,
  isOpened,
  onClose,
  subscription,
  owner,
  code,
}: {
  isAdmin: boolean;
  isOpened: boolean;
  onClose: () => void;
  subscription: SubscriptionType;
  owner: WorkspaceType;
  code: WorkspaceLimit;
}) {
  const [isFairUsageModalOpened, setIsFairUsageModalOpened] = useState(false);

  const router = useAppRouter();
  const limitPrompt = getLimitPromptForCode(
    router,
    owner,
    code,
    subscription,
    () => setIsFairUsageModalOpened(true),
    isAdmin
  );

  if (!limitPrompt) {
    return null;
  }

  const { title, children, validateLabel, onValidate } = limitPrompt;

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
