import { CreditUsage } from "@app/components/app/CreditUsage";
import { FairUseCreditsUsage } from "@app/components/app/FairUseCreditsUsage";
import { UserMenu } from "@app/components/UserMenu";
import { FREE_TRIAL_PHONE_PLAN_CODE } from "@app/lib/plans/plan_codes";
import { useMyUsage } from "@app/lib/swr/credits";
import type { SubscriptionType } from "@app/types/plan";
import { isCreditPricedPlan } from "@app/types/plan";
import type { UserTypeWithWorkspaces, WorkspaceType } from "@app/types/user";

const DAY_DURATION_MS = 24 * 60 * 60 * 1000;

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
  const { creditUsageStatus } = useMyUsage({
    workspaceId: owner.sId,
    disabled: !isCreditBased,
  });
  const creditUsageState = creditUsageStatus
    ? {
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
  const showCreditUsageInProfileMenu = creditUsageState?.target === "on_target";

  return (
    <>
      {subscription.plan.code !== FREE_TRIAL_PHONE_PLAN_CODE &&
        !isCreditBased &&
        subscription.plan.limits.assistant.maxAwuCredits !== -1 && (
          <FairUseCreditsUsage workspaceId={owner.sId} />
        )}
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
