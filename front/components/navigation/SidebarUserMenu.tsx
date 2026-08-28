import type { CreditUsageState } from "@app/components/app/CreditUsage";
import { CreditUsage } from "@app/components/app/CreditUsage";
import { FairUseCreditsUsage } from "@app/components/app/FairUseCreditsUsage";
import { UserMenu } from "@app/components/UserMenu";
import { AGENT_MESSAGE_COMPLETED_EVENT } from "@app/lib/notifications/events";
import { FREE_TRIAL_PHONE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { useMyUsage } from "@app/lib/swr/credits";
import { useFairUseCredits } from "@app/lib/swr/fair_use_credits";
import type { CreditUsageTarget } from "@app/types/api/credits/usage_status";
import type { SubscriptionType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";
import { useEffect, useRef } from "react";

const DAY_DURATION_MS = 24 * 60 * 60 * 1000;
const ROLLING_WINDOW_DAYS = 7;
const CREDITS_USAGE_ELEVATED_THRESHOLD = 0.75;
const CREDITS_USAGE_CRITICAL_THRESHOLD = 0.9;

// Credit accounting runs asynchronously after message completion; give it time to land before
// refreshing the rolling usage.
const MUTATE_DELAY_MS = 3000;

function getRollingCreditUsageTarget(usageRatio: number): CreditUsageTarget {
  if (usageRatio >= CREDITS_USAGE_CRITICAL_THRESHOLD) {
    return "critical";
  }
  if (usageRatio >= CREDITS_USAGE_ELEVATED_THRESHOLD) {
    return "elevated";
  }
  return "on_target";
}

interface SidebarUserMenuProps {
  user: UserTypeWithWorkspaces;
  owner: WorkspaceType;
  subscription: SubscriptionType;
}

export function SidebarUserMenu({
  user,
  owner,
  subscription,
}: SidebarUserMenuProps) {
  const isCreditBased = isCreditPricedPlan(subscription.plan);
  const { maxAwuCredits, maxAwuCreditsTimeframe } =
    subscription.plan.limits.assistant;
  const hasRollingCreditUsage =
    !isCreditBased && maxAwuCredits > 0 && maxAwuCreditsTimeframe === "week";
  const { creditUsageStatus } = useMyUsage({
    workspaceId: owner.sId,
    disabled: !isCreditBased,
  });
  const { fairUseAwuCreditsState, mutateFairUseCredits } = useFairUseCredits({
    workspaceId: owner.sId,
    disabled: !hasRollingCreditUsage,
  });
  const mutateTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!hasRollingCreditUsage) {
      return;
    }

    const handleAgentMessageCompleted = () => {
      if (mutateTimeoutRef.current) {
        clearTimeout(mutateTimeoutRef.current);
      }
      mutateTimeoutRef.current = setTimeout(() => {
        mutateTimeoutRef.current = null;
        void mutateFairUseCredits();
      }, MUTATE_DELAY_MS);
    };
    window.addEventListener(
      AGENT_MESSAGE_COMPLETED_EVENT,
      handleAgentMessageCompleted
    );
    return () => {
      window.removeEventListener(
        AGENT_MESSAGE_COMPLETED_EVENT,
        handleAgentMessageCompleted
      );
      if (mutateTimeoutRef.current) {
        clearTimeout(mutateTimeoutRef.current);
      }
    };
  }, [hasRollingCreditUsage, mutateFairUseCredits]);

  const billingPeriodCreditUsageState: CreditUsageState | null =
    creditUsageStatus
      ? {
          kind: "billing_period",
          usedPercentage: creditUsageStatus.usedPercentage,
          resetInDays: Math.max(
            0,
            Math.ceil(
              (new Date(creditUsageStatus.resetAt).getTime() - Date.now()) /
                DAY_DURATION_MS
            )
          ),
          target: creditUsageStatus.target,
        }
      : null;
  const rollingCreditUsageRatio =
    fairUseAwuCreditsState &&
    fairUseAwuCreditsState.limit > 0 &&
    fairUseAwuCreditsState.timeframe === "week"
      ? fairUseAwuCreditsState.count / fairUseAwuCreditsState.limit
      : null;
  const rollingCreditUsageState: CreditUsageState | null =
    fairUseAwuCreditsState && rollingCreditUsageRatio !== null
      ? {
          kind: "rolling_window",
          usedCredits: fairUseAwuCreditsState.count,
          limitCredits: fairUseAwuCreditsState.limit,
          windowDays: ROLLING_WINDOW_DAYS,
          usedPercentage: Math.round(rollingCreditUsageRatio * 100),
          target: getRollingCreditUsageTarget(rollingCreditUsageRatio),
        }
      : null;
  const creditUsageState =
    billingPeriodCreditUsageState ?? rollingCreditUsageState;
  const showCreditUsageInProfileMenu = creditUsageState?.target === "on_target";

  return (
    <>
      {subscription.plan.code !== FREE_TRIAL_PHONE_PLAN_CODE &&
        !isCreditBased &&
        !hasRollingCreditUsage &&
        maxAwuCredits !== -1 && <FairUseCreditsUsage workspaceId={owner.sId} />}
      {creditUsageState && !showCreditUsageInProfileMenu && (
        <div className="mx-3 mb-3">
          <CreditUsage state={creditUsageState} variant="companion" />
        </div>
      )}
      <UserMenu
        user={user}
        owner={owner}
        subscription={subscription}
        creditUsageState={
          showCreditUsageInProfileMenu ? creditUsageState : null
        }
      />
    </>
  );
}
