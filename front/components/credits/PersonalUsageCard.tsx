import { UsageUpgradeButton } from "@app/components/credits/UsageUpgradeButton";
import { AwuUsageBar } from "@app/components/workspace/MembersUsageTable";
import { useAuth, useFeatureFlags } from "@app/lib/auth/AuthContext";
import {
  formatCredits,
  formatRelativeResetDay,
  getTimeframeSecondsFromLiteral,
  roundCredits,
} from "@app/lib/client/credits";
import { getActiveLocale } from "@app/lib/i18n/active_locale";
import { formatDate } from "@app/lib/i18n/format";
import { useMyUsage, useSeatPlan } from "@app/lib/swr/credits";
import { useFairUseCredits } from "@app/lib/swr/fair_use_credits";
import { useWorkspaceUsageStatus } from "@app/lib/swr/user";
import { isCreditPricedPlan } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import {
  ProgressBar,
  Separator,
  Spinner,
  Stars02,
  Tooltip,
} from "@dust-tt/sparkle";
import { plural, select } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";

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
  const { t } = useLingui();
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
  const nextPremiumModelRefillDay = premiumModelUsage?.nextRefill
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
  const formatRollingResetLabel = (windowDays: number) =>
    t`${plural(windowDays, {
      one: "Resets on a rolling #-day basis",
      other: "Resets on a rolling #-day basis",
    })}`;
  // A fixed window resets all at once at `nextResetAt`; a rolling one slides
  // continuously, so it is described by its window length instead.
  let fairUseResetLabel: string | null = null;
  if (
    fairUseAwuCreditsState?.windowKind === "fixed" &&
    fairUseAwuCreditsState.nextResetAt
  ) {
    const { kind: resetDayKind, day: resetDay } = formatRelativeResetDay(
      fairUseAwuCreditsState.nextResetAt
    );
    fairUseResetLabel = t`${select(resetDayKind, {
      relative: `Resets ${resetDay}`,
      weekday: `Resets on ${resetDay}`,
      other: `Resets on ${resetDay}`,
    })}`;
  } else if (fairUseWindowDays !== null) {
    fairUseResetLabel = formatRollingResetLabel(fairUseWindowDays);
  }
  let fairUseRefillLabel: string | null = null;
  if (isFairUseCreditsAtLimit && nextFairUseRefill) {
    const refillCreditCount = roundCredits(nextFairUseRefill.credits);
    const refillCredits = formatCredits(nextFairUseRefill.credits);
    const { kind: refillDayKind, day: refillDay } = formatRelativeResetDay(
      nextFairUseRefill.date
    );
    fairUseRefillLabel = t`${select(refillDayKind, {
      relative: plural(refillCreditCount, {
        one: `${refillCredits} credit available again ${refillDay}`,
        other: `${refillCredits} credits available again ${refillDay}`,
      }),
      weekday: plural(refillCreditCount, {
        one: `${refillCredits} credit available again on ${refillDay}`,
        other: `${refillCredits} credits available again on ${refillDay}`,
      }),
      other: plural(refillCreditCount, {
        one: `${refillCredits} credit available again on ${refillDay}`,
        other: `${refillCredits} credits available again on ${refillDay}`,
      }),
    })}`;
  }
  const premiumModelWindowDays = premiumModelUsage?.windowDays ?? 0;
  const premiumModelRefillMessages =
    premiumModelUsage?.nextRefill?.messages ?? null;
  let premiumModelLimitLabel: string;
  if (premiumModelRefillMessages !== null && nextPremiumModelRefillDay) {
    const { kind: refillDayKind, day: refillDay } = nextPremiumModelRefillDay;
    premiumModelLimitLabel = t`${select(refillDayKind, {
      relative: plural(premiumModelRefillMessages, {
        one: `# message available again ${refillDay}`,
        other: `# messages available again ${refillDay}`,
      }),
      weekday: plural(premiumModelRefillMessages, {
        one: `# message available again on ${refillDay}`,
        other: `# messages available again on ${refillDay}`,
      }),
      other: plural(premiumModelRefillMessages, {
        one: `# message available again on ${refillDay}`,
        other: `# messages available again on ${refillDay}`,
      }),
    })}`;
  } else {
    premiumModelLimitLabel = t`${plural(premiumModelWindowDays, {
      one: "Messages become available # day after use",
      other: "Messages become available # days after use",
    })}`;
  }
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
                  <Trans>Your credits</Trans>
                </span>
                {nextCreditResetAt &&
                  myUsage?.seatType !== "free" &&
                  (() => {
                    const resetDate = formatDate(
                      new Date(nextCreditResetAt),
                      {
                        month: "long",
                        day: "numeric",
                        timeZone: "UTC",
                      },
                      getActiveLocale()
                    );
                    return (
                      <span className="text-xs text-muted-foreground">
                        <Trans>Resets on {resetDate}</Trans>
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
                    <Trans>Fair usage credits</Trans>
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
                        label={t`Fair-use credits consumed`}
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
                      <span className="font-medium">
                        <Trans>Reset schedule:</Trans>
                      </span>
                      {fairUseAwuCreditsState.refillSchedule.map(
                        ({ date, credits }) => (
                          <span key={date}>
                            {formatDate(
                              new Date(date),
                              {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              },
                              getActiveLocale()
                            )}
                            : +{formatCredits(credits)}
                          </span>
                        )
                      )}
                    </div>
                  }
                />
              ) : (
                <ProgressBar
                  label={t`Fair-use credits consumed`}
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
              {fairUseRefillLabel ? (
                <span className="text-xs text-muted-foreground">
                  {fairUseRefillLabel}
                </span>
              ) : null}
            </div>
          ) : null}
          {showPremiumModelUsage && premiumModelUsage ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm font-medium text-foreground">
                    <Trans>Premium messages</Trans>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatRollingResetLabel(premiumModelUsage.windowDays)}
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
                        label={t`Premium messages used`}
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
                      <span className="font-medium">
                        <Trans>Reset schedule:</Trans>
                      </span>
                      {premiumModelUsage.refillSchedule.map(
                        ({ date, messages }) => (
                          <span key={date}>
                            {formatDate(
                              new Date(date),
                              {
                                month: "short",
                                day: "numeric",
                                timeZone: "UTC",
                              },
                              getActiveLocale()
                            )}
                            : +{messages}
                          </span>
                        )
                      )}
                    </div>
                  }
                />
              ) : (
                <ProgressBar
                  label={t`Premium messages used`}
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
                  {premiumModelLimitLabel}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
