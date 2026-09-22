import { UsageUpgradeButton } from "@app/components/credits/UsageUpgradeButton";
import { AwuUsageBar } from "@app/components/workspace/MembersUsageTable";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  formatCredits,
  formatCreditValue,
  formatRelativeResetDay,
  getTimeframeSecondsFromLiteral,
} from "@app/lib/client/credits";
import { useMyUsage, useSeatPlan } from "@app/lib/swr/credits";
import { useFairUseCredits } from "@app/lib/swr/fair_use_credits";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import { isCreditPricedPlan } from "@app/types/plan";
import { ordinalDay } from "@app/types/shared/utils/date_utils";
import { pluralize } from "@app/types/shared/utils/string_utils";
import type { WorkspaceType } from "@app/types/user";
import {
  ProgressBar,
  Separator,
  Spinner,
  Stars02,
  Tooltip,
} from "@dust-tt/sparkle";

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
  const nextPremiumModelRefillDate = premiumModelUsage?.nextRefill
    ? formatRelativeResetDay(premiumModelUsage.nextRefill.availableAt)
    : null;
  const fairUseCreditsPercentage = fairUseAwuCreditsState
    ? Math.min(
        (fairUseAwuCreditsState.count / fairUseAwuCreditsState.limit) * 100,
        100
      )
    : 0;
  const isFairUseCreditsAtLimit = fairUseAwuCreditsState
    ? fairUseAwuCreditsState.count >= fairUseAwuCreditsState.limit
    : false;
  const nextFairUseRefill = fairUseAwuCreditsState?.refillSchedule?.[0] ?? null;
  // "lifetime" never refills, so it has no rolling window to report.
  const fairUseWindowDays =
    fairUseAwuCreditsState && fairUseAwuCreditsState.timeframe !== "lifetime"
      ? getTimeframeSecondsFromLiteral(fairUseAwuCreditsState.timeframe) /
        (24 * 60 * 60)
      : null;
  // A fixed window resets all at once at `nextResetAt`; a rolling one slides
  // continuously, so it is described by its window length instead.
  const fairUseResetLabel =
    fairUseAwuCreditsState?.windowKind === "fixed" &&
    fairUseAwuCreditsState.nextResetAt
      ? `Resets ${formatRelativeResetDay(fairUseAwuCreditsState.nextResetAt)}`
      : fairUseWindowDays !== null
        ? `Resets on a rolling ${fairUseWindowDays}-day basis`
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
                    Fair Usage credits
                  </span>
                  {fairUseResetLabel && (
                    <span className="text-xs text-muted-foreground">
                      {fairUseResetLabel}
                    </span>
                  )}
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {formatCredits(fairUseAwuCreditsState.count)}/
                  {formatCredits(fairUseAwuCreditsState.limit)}
                </span>
              </div>
              {fairUseAwuCreditsState.refillSchedule &&
              fairUseAwuCreditsState.refillSchedule.length > 0 ? (
                <Tooltip
                  tooltipTriggerAsChild
                  trigger={
                    <div className="flex h-1.5 w-full cursor-help items-center">
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
                  }
                  label={
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Reset schedule:</span>
                      {fairUseAwuCreditsState.refillSchedule.map(
                        ({ date, credits }) => (
                          <span key={date}>
                            {new Date(date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            })}
                            : +{formatCredits(credits)}
                          </span>
                        )
                      )}
                    </div>
                  }
                />
              ) : (
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
              )}
              {isFairUseCreditsAtLimit && nextFairUseRefill ? (
                <span className="text-xs text-muted-foreground">
                  {formatCreditValue(nextFairUseRefill.credits)} available again{" "}
                  {formatRelativeResetDay(nextFairUseRefill.date)}
                </span>
              ) : null}
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
                    Resets on a rolling {premiumModelUsage.windowDays}-day basis
                  </span>
                </div>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {premiumModelUsage.usedMessages}/
                  {premiumModelUsage.limitMessages}
                </span>
              </div>
              {premiumModelUsage.refillSchedule &&
              premiumModelUsage.refillSchedule.length > 0 ? (
                <Tooltip
                  tooltipTriggerAsChild
                  trigger={
                    <div className="flex h-1.5 w-full cursor-help items-center">
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
                    </div>
                  }
                  label={
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium">Reset schedule:</span>
                      {premiumModelUsage.refillSchedule.map(
                        ({ date, messages }) => (
                          <span key={date}>
                            {new Date(date).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              timeZone: "UTC",
                            })}
                            : +{messages}
                          </span>
                        )
                      )}
                    </div>
                  }
                />
              ) : (
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
              )}
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
