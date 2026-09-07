import { UsageUpgradeButton } from "@app/components/credits/UsageUpgradeButton";
import { AwuUsageBar } from "@app/components/workspace/MembersUsageTable";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  formatCreditResetCountdown,
  formatCredits,
  formatFairUseAllowance,
} from "@app/lib/client/credits";
import { useMyUsage, useSeatPlan } from "@app/lib/swr/credits";
import { useFairUseCredits } from "@app/lib/swr/fair_use_credits";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import { isCreditPricedPlan } from "@app/types/plan";
import { ONE_DAY_MS, ordinalDay } from "@app/types/shared/utils/date_utils";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import { ProgressBar, Separator, Spinner, Stars02 } from "@dust-tt/sparkle";

interface PersonalUsageCardProps {
  owner: WorkspaceType;
  visible: boolean;
  onManagerNavigate?: () => void;
}

export function PersonalUsageCard({
  owner,
  visible,
  onManagerNavigate,
}: PersonalUsageCardProps) {
  const { isManager, subscription } = useAuth();
  const { hasFeature } = useFeatureFlags();
  const isCreditBased = isCreditPricedPlan(subscription.plan);
  const showFairUseCredits =
    !isCreditBased &&
    !hasFeature("disable_fair_use_awu_limit") &&
    subscription.plan.limits.assistant.maxAwuCredits > 0;
  const showPremiumModelUsage =
    !isCreditBased && hasFeature("enforce_premium_model_message_limit");
  const { myUsage, premiumModelUsage, nextCreditResetAt, isMyUsageLoading } =
    useMyUsage({
      workspaceId: owner.sId,
      disabled: !visible || (!isCreditBased && !showPremiumModelUsage),
    });
  const { fairUseAwuCreditsState, isFairUseCreditsLoading } = useFairUseCredits(
    {
      workspaceId: owner.sId,
      disabled: !visible || !showFairUseCredits,
    }
  );
  const { seatPlans } = useSeatPlan({
    workspaceId: owner.sId,
    disabled: !isCreditBased || !visible,
  });
  const { hasPendingUpgradeRequest, requireReason } = useWorkspaceUsageStatus({
    owner,
    disabled: isManager || !isCreditBased || !visible,
  });

  if (!isCreditBased && !showFairUseCredits && !showPremiumModelUsage) {
    return null;
  }

  const seatName =
    (myUsage?.seatType ? seatPlans[myUsage.seatType]?.name : null) ??
    subscription.plan.name;
  const hasPersonalUsage =
    (myUsage?.spendLimitAwuCredits ?? myUsage?.memberUsageLimit ?? null) !==
    null;
  const premiumModelUsagePercentage = premiumModelUsage
    ? Math.min(
        (premiumModelUsage.usedMessages / premiumModelUsage.limitMessages) *
          100,
        100
      )
    : 0;
  const isPremiumModelUsageAtLimit = premiumModelUsage
    ? premiumModelUsage.usedMessages >= premiumModelUsage.limitMessages
    : false;
  const nextPremiumModelRefillDate = (() => {
    if (!premiumModelUsage?.nextRefill) {
      return null;
    }

    const availableAt = new Date(premiumModelUsage.nextRefill.availableAt);
    const now = new Date();
    const availableDayMs = Date.UTC(
      availableAt.getUTCFullYear(),
      availableAt.getUTCMonth(),
      availableAt.getUTCDate()
    );
    const currentDayMs = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    );
    const daysUntilAvailable = Math.round(
      (availableDayMs - currentDayMs) / ONE_DAY_MS
    );

    if (daysUntilAvailable === 0) {
      return "today";
    }
    if (daysUntilAvailable === 1) {
      return "tomorrow";
    }
    return `on ${availableAt.toLocaleDateString("en-US", {
      weekday: "long",
      timeZone: "UTC",
    })}`;
  })();
  const fairUseCreditsPercentage = fairUseAwuCreditsState
    ? Math.min(
        (fairUseAwuCreditsState.count / fairUseAwuCreditsState.limit) * 100,
        100
      )
    : 0;
  const fairUseCreditsSubtitle = fairUseAwuCreditsState?.nextResetAt
    ? formatCreditResetCountdown(fairUseAwuCreditsState.nextResetAt)
    : null;
  const isLoading = isMyUsageLoading || isFairUseCreditsLoading;

  return (
    <section className="flex flex-col gap-2 rounded-lg bg-muted-background p-4">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-highlight-100 outline outline-1 outline-highlight-500/20">
            <Stars02 className="h-3 w-3 text-highlight-500" />
          </span>
          <span className="text-base font-semibold text-foreground">
            {seatName}
          </span>
        </span>
        <UsageUpgradeButton
          owner={owner}
          hasPendingUpgradeRequest={hasPendingUpgradeRequest}
          variant="button"
          isManager={isManager}
          requireReason={requireReason}
          onManagerNavigate={onManagerNavigate}
        />
      </div>
      <Separator />
      {isLoading ? (
        <div className="flex justify-center py-2">
          <Spinner size="sm" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {isCreditBased && hasPersonalUsage ? (
            <>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">
                  Your Credits
                </span>
                {nextCreditResetAt &&
                  myUsage?.seatType !== "free" &&
                  (() => {
                    const resetAt = new Date(nextCreditResetAt);
                    const month = resetAt.toLocaleDateString("en-US", {
                      month: "long",
                      timeZone: "UTC",
                    });
                    return (
                      <span className="text-xs text-muted-foreground">
                        Resets on {month} {ordinalDay(resetAt.getUTCDate())}
                      </span>
                    );
                  })()}
              </div>
              <AwuUsageBar
                consumed={myUsage?.consumedAwuCredits ?? 0}
                consumedFromAllowance={
                  myUsage?.consumedFromAllowanceAwuCredits ?? 0
                }
                consumedFromPool={myUsage?.consumedFromPoolAwuCredits ?? 0}
                memberUsageLimit={myUsage?.memberUsageLimit ?? null}
                seatBalanceAwu={myUsage?.seatBalanceAwu ?? null}
                effectiveLimit={myUsage?.spendLimitAwuCredits ?? 0}
                spendLimitSource={myUsage?.spendLimitSource ?? "none"}
                spendLimitGroupName={myUsage?.spendLimitGroupName ?? null}
                seatType={myUsage?.seatType ?? null}
                isTotalAllowedUsagePending={false}
              />
            </>
          ) : null}
          {showFairUseCredits && fairUseAwuCreditsState ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    Credits consumption
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {fairUseCreditsSubtitle ??
                      formatFairUseAllowance(fairUseAwuCreditsState.timeframe)}
                  </span>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatCredits(fairUseAwuCreditsState.count)}/
                  {formatCredits(fairUseAwuCreditsState.limit)}
                </span>
              </div>
              <ProgressBar
                label="Fair-use credits consumed"
                className="h-1.5 w-full bg-primary-100"
                values={[
                  {
                    value: fairUseCreditsPercentage,
                    className: "bg-foreground",
                  },
                  {
                    value: 100 - fairUseCreditsPercentage,
                    className: "bg-transparent",
                  },
                ]}
              />
            </div>
          ) : null}
          {showPremiumModelUsage && premiumModelUsage ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    Premium messages
                  </span>
                  <span className="text-xs text-muted-foreground">
                    The limit applies to the past {premiumModelUsage.windowDays}{" "}
                    day{pluralize(premiumModelUsage.windowDays)}
                  </span>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {premiumModelUsage.usedMessages}/
                  {premiumModelUsage.limitMessages}
                </span>
              </div>
              <ProgressBar
                label="Premium messages used"
                className="h-1.5 w-full bg-primary-100"
                values={[
                  {
                    value: premiumModelUsagePercentage,
                    className: "bg-foreground",
                  },
                  {
                    value: 100 - premiumModelUsagePercentage,
                    className: "bg-transparent",
                  },
                ]}
              />
              {isPremiumModelUsageAtLimit ? (
                <span className="text-xs text-muted-foreground">
                  {premiumModelUsage.nextRefill &&
                  nextPremiumModelRefillDate ? (
                    <>
                      {premiumModelUsage.nextRefill.messages} message
                      {pluralize(premiumModelUsage.nextRefill.messages)}{" "}
                      available again {nextPremiumModelRefillDate}
                    </>
                  ) : (
                    `Messages become available ${premiumModelUsage.windowDays} days after use`
                  )}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
