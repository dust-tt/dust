import {
  FairUsageModal,
  fairUseSeatLimitFromPlan,
} from "@app/components/FairUsageModal";
import { isFreeTrialPhonePlan } from "@app/lib/plans/plan_codes";
import type { AppRouter } from "@app/lib/platform";
import { useAppRouter } from "@app/lib/platform";
import type { SubmitMessageError } from "@app/types/assistant/conversation";
import type {
  MaxAwuCreditsTimeframeType,
  MaxMessagesTimeframeType,
  SubscriptionType,
} from "@app/types/plan";
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
import type { MessageDescriptor } from "@lingui/core";
import { msg, plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useRef, useState } from "react";

export type WorkspaceLimit =
  | "cant_invite_no_seats_available"
  | "cant_invite_free_plan"
  | "cant_invite_payment_failure"
  | "message_limit"
  | "credits_exhausted"
  | "pool_credits_exhausted"
  | "user_credits_exhausted"
  | "group_shared_usage_limit_reached"
  | "no_seat";

// Maps a raw API error.type string (from retry/edit endpoints) to the blocking
// popup code, or null when it's a non-limit error.
export function getWorkspaceLimitFromApiErrorType(
  type: string
): WorkspaceLimit | null {
  switch (type) {
    case "plan_message_limit_exceeded":
      return "message_limit";
    case "credits_exhausted":
      return "pool_credits_exhausted";
    case "user_cap_reached":
      return "user_credits_exhausted";
    case "group_shared_usage_limit_reached":
      return "group_shared_usage_limit_reached";
    case "no_seat":
      return "no_seat";
    default:
      return null;
  }
}

// Maps a message-send failure to the blocking popup it should open, or null when
// the failure is transient and should be surfaced as a notification instead.
export function getWorkspaceLimitForSubmitError(
  type: SubmitMessageError["type"]
): WorkspaceLimit | null {
  switch (type) {
    case "plan_limit_reached_error":
      return "message_limit";
    case "credits_exhausted_error":
      return "pool_credits_exhausted";
    case "user_cap_reached_error":
      return "user_credits_exhausted";
    case "group_shared_usage_limit_reached_error":
      return "group_shared_usage_limit_reached";
    case "no_seat_error":
      return "no_seat";
    case "user_not_found":
    case "attachment_upload_error":
    case "message_send_error":
    case "content_too_large":
      return null;
    default:
      assertNeverAndIgnore(type);
      return null;
  }
}

type Translate = (descriptor: MessageDescriptor) => string;

function getAwuCreditsLimitSentence(
  credits: number,
  timeframe: MaxAwuCreditsTimeframeType,
  t: Translate
): string {
  switch (timeframe) {
    case "day":
      return t(
        msg`Your account has reached its limit of ${plural(credits, {
          one: "# credit",
          other: "# credits",
        })} over the past 24 hours.`
      );
    case "week":
      return t(
        msg`Your account has reached its limit of ${plural(credits, {
          one: "# credit",
          other: "# credits",
        })} over the past 7 days.`
      );
    case "month":
      return t(
        msg`Your account has reached its limit of ${plural(credits, {
          one: "# credit",
          other: "# credits",
        })} over the past 30 days.`
      );
    case "lifetime":
      return t(
        msg`Your account has reached its limit of ${plural(credits, {
          one: "# credit",
          other: "# credits",
        })} for your current plan.`
      );
    default:
      assertNeverAndIgnore(timeframe);
      return "";
  }
}

function getMessagesLimitSentence(
  messages: number,
  timeframe: MaxMessagesTimeframeType,
  t: Translate
): string {
  switch (timeframe) {
    case "day":
      return t(
        msg`Your workspace has reached its shared limit of ${plural(messages, {
          one: "# message per user",
          other: "# messages per user",
        })} over the past 24 hours.`
      );
    case "lifetime":
      return t(
        msg`Your workspace has reached its shared limit of ${plural(messages, {
          one: "# message per user",
          other: "# messages per user",
        })} for your current plan.`
      );
    default:
      assertNeverAndIgnore(timeframe);
      return "";
  }
}

function getLimitPromptForCode(
  router: AppRouter,
  owner: WorkspaceType,
  code: WorkspaceLimit,
  subscription: SubscriptionType,
  displayFairUseModal: () => void,
  isAdmin: boolean,
  t: Translate
) {
  switch (code) {
    case "cant_invite_no_seats_available": {
      return {
        title: t(msg`Plan limits`),
        validateLabel: t(msg`Manage your subscription`),
        onValidate: () => {
          void router.push(`/w/${owner.sId}/subscription`);
        },
        children: (
          <>
            <Page.P>
              <Trans>
                Workspace has reached its member limit. Please upgrade or remove
                inactive members to add more.
              </Trans>
            </Page.P>
          </>
        ),
      };
    }
    case "cant_invite_free_plan":
      return {
        title: t(msg`Free plan`),
        validateLabel: t(msg`Manage your subscription`),
        onValidate: () => {
          void router.push(`/w/${owner.sId}/subscription`);
        },
        children: (
          <>
            <Page.P>
              <Trans>
                You cannot invite other members with the free plan. Upgrade your
                plan for unlimited members.
              </Trans>
            </Page.P>
          </>
        ),
      };
    case "cant_invite_payment_failure":
      return {
        title: t(msg`Failed payment`),
        validateLabel: t(msg`Manage your subscription`),
        onValidate: () => {
          void router.push(`/w/${owner.sId}/subscription`);
        },
        children: (
          <>
            <Page.P>
              <Trans>
                You cannot invite other members while your workspace has a
                failed payment.
              </Trans>
            </Page.P>
          </>
        ),
      };

    case "message_limit": {
      const assistantLimits = subscription.plan.limits.assistant;
      const isAwuCreditsFairUseLimit = assistantLimits.maxAwuCredits !== -1;

      if (isFreeTrialPhonePlan(subscription.plan.code)) {
        return {
          title: t(msg`Dust trial message limit reached`),
          validateLabel: isAdmin ? t(msg`Subscribe to Dust`) : t(msg`Ok`),
          onValidate: isAdmin
            ? () => {
                void router.push(`/w/${owner.sId}/subscription`);
              }
            : undefined,
          children: (
            <>
              <Page.P>
                <Trans>
                  You have reached the message limit under the trial. You can
                  subscribe to a paid plan to continue using Dust.
                </Trans>
              </Page.P>
            </>
          ),
        };
      } else {
        if (isAwuCreditsFairUseLimit) {
          return {
            title: t(msg`Credit quota exceeded`),
            validateLabel: t(msg`Ok`),
            children: (
              <p className="text-sm font-normal text-muted-foreground">
                <Trans>
                  We've paused messaging for your account due to our fair usage
                  policy.
                </Trans>{" "}
                {getAwuCreditsLimitSentence(
                  assistantLimits.maxAwuCredits,
                  assistantLimits.maxAwuCreditsTimeframe,
                  t
                )}{" "}
                <Trans>
                  Check our{" "}
                  <Hoverable
                    variant="highlight"
                    onClick={() => displayFairUseModal()}
                  >
                    Fair Use policy
                  </Hoverable>{" "}
                  to learn more.
                </Trans>
              </p>
            ),
          };
        } else {
          return {
            title: t(msg`Message quota exceeded`),
            validateLabel: t(msg`Ok`),
            children: (
              <p className="text-sm font-normal text-muted-foreground">
                <Trans>
                  We've paused messaging for your workspace due to our fair
                  usage policy.
                </Trans>{" "}
                {getMessagesLimitSentence(
                  assistantLimits.maxMessages,
                  assistantLimits.maxMessagesTimeframe,
                  t
                )}{" "}
                <Trans>
                  This total limit is collectively shared by all users in the
                  workspace.
                </Trans>{" "}
                <Trans>
                  Check our{" "}
                  <Hoverable
                    variant="highlight"
                    onClick={() => displayFairUseModal()}
                  >
                    Fair Use policy
                  </Hoverable>{" "}
                  to learn more.
                </Trans>
              </p>
            ),
          };
        }
      }
    }

    case "credits_exhausted":
    case "pool_credits_exhausted": {
      const creditsManagementHref = isCreditPricedPlan(subscription.plan)
        ? `/w/${owner.sId}/credits`
        : `/w/${owner.sId}/developers/credits-usage`;
      return {
        title: t(msg`Workspace out of credits`),
        validateLabel: isAdmin ? t(msg`Manage credits`) : t(msg`Ok`),
        onValidate: isAdmin
          ? () => {
              void router.push(creditsManagementHref);
            }
          : undefined,
        children: (
          <>
            <Page.P>
              {isAdmin
                ? t(
                    msg`Your workspace has run out of credits. Please purchase more credits to continue using Dust.`
                  )
                : t(
                    msg`Your workspace has run out of credits. Please contact your administrator to purchase more credits.`
                  )}
            </Page.P>
          </>
        ),
      };
    }

    case "no_seat": {
      return {
        title: t(msg`No seat assigned`),
        validateLabel: isAdmin ? t(msg`Go to usage page`) : t(msg`Ok`),
        onValidate: isAdmin
          ? () => {
              void router.push(`/w/${owner.sId}/credits?openChangeMySeat`);
            }
          : undefined,
        children: (
          <>
            <Page.P>
              {isAdmin
                ? t(
                    msg`You don't have a seat assigned in this workspace. Go to the usage page to assign yourself one.`
                  )
                : t(
                    msg`You don't have a seat assigned in this workspace. Please contact your administrator to assign you one.`
                  )}
            </Page.P>
          </>
        ),
      };
    }

    case "user_credits_exhausted": {
      // Off credit plans the per-member cap is set by Dust, not on the Usage
      // page, so there is nothing for an admin to change there.
      const canManageCap = isAdmin && isCreditPricedPlan(subscription.plan);
      return {
        title: t(msg`Usage cap reached`),
        validateLabel: canManageCap ? t(msg`Go to Usage`) : t(msg`Ok`),
        onValidate: canManageCap
          ? () => {
              void router.push(`/w/${owner.sId}/credits?openChangeMySeat`);
            }
          : undefined,
        children: (
          <>
            <Page.P>
              {canManageCap
                ? t(
                    msg`You have reached your personal usage cap. On the usage page you can change your seat or adjust user caps.`
                  )
                : isAdmin
                  ? t(
                      msg`You have reached your personal usage cap. Please contact your Dust representative to adjust it.`
                    )
                  : t(
                      msg`You have reached your personal usage cap. Please contact your administrator to increase it.`
                    )}
            </Page.P>
          </>
        ),
      };
    }

    case "group_shared_usage_limit_reached":
      return {
        title: t(msg`Shared usage limit reached`),
        validateLabel: t(msg`Ok`),
        children: (
          <Page.P>
            {isAdmin
              ? t(
                  msg`Your group has reached its shared usage limit. You can adjust shared usage limits on the usage page.`
                )
              : t(
                  msg`Your group has reached its shared usage limit. Please contact your group managers or administrator to increase it.`
                )}
          </Page.P>
        ),
      };

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
  const { t } = useLingui();
  const [isFairUsageModalOpened, setIsFairUsageModalOpened] = useState(false);

  // Keep the last code that was shown while open so the closing animation
  // doesn't flash the fallback content when the parent nulls limitReachedCode.
  const activeCodeRef = useRef(code);
  if (isOpened) {
    activeCodeRef.current = code;
  }
  const activeCode = activeCodeRef.current;

  const router = useAppRouter();
  const limitPrompt = getLimitPromptForCode(
    router,
    owner,
    activeCode,
    subscription,
    () => setIsFairUsageModalOpened(true),
    isAdmin,
    t
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
        seatLimit={fairUseSeatLimitFromPlan(subscription.plan)}
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
            // When there is no distinct action (onValidate), the validate button
            // just closes the dialog, so a separate Cancel button would be
            // redundant — render a single button in that case.
            leftButtonProps={
              onValidate
                ? {
                    label: t`Cancel`,
                    variant: "outline",
                  }
                : undefined
            }
            rightButtonProps={{
              label: validateLabel,
              variant: "highlight",
              onClick: onValidate ?? (() => onClose()),
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
