import type { CreditUsageState } from "@app/components/app/CreditUsage";
import { CreditUsage } from "@app/components/app/CreditUsage";
import { FairUseCreditsUsage } from "@app/components/app/FairUseCreditsUsage";
import { UserMenu } from "@app/components/UserMenu";
import { FREE_TRIAL_PHONE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { useMyUsage } from "@app/lib/swr/credits";
import { useFairUseCredits } from "@app/lib/swr/fair_use_credits";
import type { SubscriptionType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";

const DAY_DURATION_MS = 24 * 60 * 60 * 1000;

interface SidebarUserMenuProps {
  user: UserTypeWithWorkspaces;
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isFairUseAwuLimitDisabled: boolean;
}

export function SidebarUserMenu({
  user,
  owner,
  subscription,
  isFairUseAwuLimitDisabled,
}: SidebarUserMenuProps) {
  const isCreditBased = isCreditPricedPlan(subscription.plan);
  const { maxAwuCredits, maxAwuCreditsTimeframe } =
    subscription.plan.limits.assistant;
  const showCreditUsageLearnMoreOnly =
    !isCreditBased && isFairUseAwuLimitDisabled;
  const hasFairUseCreditUsage =
    !isCreditBased && !isFairUseAwuLimitDisabled && maxAwuCredits > 0;
  const { myUsage, creditUsageStatus } = useMyUsage({
    workspaceId: owner.sId,
    disabled: !isCreditBased,
  });
  const { fairUseAwuCreditsState } = useFairUseCredits({
    workspaceId: owner.sId,
    disabled: !hasFairUseCreditUsage,
  });

  const billingPeriodCreditUsageState: CreditUsageState | null =
    creditUsageStatus && myUsage?.seatType !== "free"
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
  const freeSeatLifetimeLimitCredits =
    myUsage?.seatType === "free" ? (myUsage.memberUsageLimit ?? 0) : 0;
  const freeSeatLifetimeUsedCredits =
    myUsage?.seatType === "free" && myUsage.seatBalanceAwu !== null
      ? Math.max(0, freeSeatLifetimeLimitCredits - myUsage.seatBalanceAwu)
      : null;
  const freeSeatLifetimeCreditUsageState: CreditUsageState | null =
    freeSeatLifetimeUsedCredits !== null && freeSeatLifetimeLimitCredits > 0
      ? {
          kind: "rolling_window",
          usedCredits: freeSeatLifetimeUsedCredits,
          limitCredits: freeSeatLifetimeLimitCredits,
          timeframe: "lifetime",
          usedPercentage: Math.round(
            (freeSeatLifetimeUsedCredits / freeSeatLifetimeLimitCredits) * 100
          ),
        }
      : null;
  const rollingCreditUsageState: CreditUsageState | null =
    hasFairUseCreditUsage &&
    fairUseAwuCreditsState &&
    fairUseAwuCreditsState.limit > 0
      ? {
          kind: "rolling_window",
          usedCredits: fairUseAwuCreditsState.count,
          limitCredits: fairUseAwuCreditsState.limit,
          timeframe: maxAwuCreditsTimeframe,
          usedPercentage: Math.round(
            (fairUseAwuCreditsState.count / fairUseAwuCreditsState.limit) * 100
          ),
        }
      : null;
  const creditUsageState =
    billingPeriodCreditUsageState ??
    freeSeatLifetimeCreditUsageState ??
    rollingCreditUsageState;
  const showCreditUsageInProfileMenu =
    creditUsageState?.kind === "rolling_window" ||
    (creditUsageState?.kind === "billing_period" &&
      creditUsageState.target === "on_target");

  return (
    <>
      {subscription.plan.code !== FREE_TRIAL_PHONE_PLAN_CODE &&
        !isFairUseAwuLimitDisabled &&
        !isCreditBased &&
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
        showCreditUsageLearnMoreOnly={showCreditUsageLearnMoreOnly}
        creditUsageState={
          showCreditUsageInProfileMenu ? creditUsageState : null
        }
      />
    </>
  );
}
