import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { getBillingCycleFromDay } from "@app/lib/client/subscription";
import { useAppRouter } from "@app/lib/platform";
import { useCreditPurchaseInfo, useCredits } from "@app/lib/swr/credits";
import type { CreditDisplayData } from "@app/types/credits";
import { ActionPieChartIcon, Icon, Page, Spinner } from "@dust-tt/sparkle";
import { useEffect, useMemo } from "react";

function isActive(credit: CreditDisplayData): boolean {
  const now = Date.now();
  const isStarted = credit.startDate !== null && credit.startDate <= now;
  const isExpired =
    credit.expirationDate !== null && credit.expirationDate <= now;
  return isStarted && !isExpired;
}

function formatAmount(amountMicroUsd: number): string {
  const amountDollars = amountMicroUsd / 1_000_000;
  return `$${amountDollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function getOrdinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) {
    return "th";
  }
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function getResetDateLabel(billingCycleStartDay: number | null): string {
  if (!billingCycleStartDay) {
    return "";
  }

  const { cycleEnd } = getBillingCycleFromDay(billingCycleStartDay);
  const resetMonth = cycleEnd.toLocaleDateString(undefined, { month: "long" });
  const resetDay = cycleEnd.getDate();
  const suffix = getOrdinalSuffix(resetDay);
  return `Monthly resets on the ${resetDay}${suffix}, ${resetMonth}`;
}

function getCreditTotals(credits: CreditDisplayData[]): {
  consumedMicroUsd: number;
  totalMicroUsd: number;
} {
  const activeCredits = credits.filter((c) => isActive(c));

  return {
    consumedMicroUsd: activeCredits.reduce(
      (sum, c) => sum + c.consumedAmountMicroUsd,
      0
    ),
    totalMicroUsd: activeCredits.reduce(
      (sum, c) => sum + c.initialAmountMicroUsd,
      0
    ),
  };
}

interface CreditPoolUsageBarProps {
  usersConsumedMicroUsd: number;
  usersTotalMicroUsd: number;
  programmaticUsageConsumedMicroUsd: number;
  programmaticUsageTotalMicroUsd: number;
}

function CreditPoolUsageBar({
  usersConsumedMicroUsd,
  usersTotalMicroUsd,
  programmaticUsageConsumedMicroUsd,
  programmaticUsageTotalMicroUsd,
}: CreditPoolUsageBarProps) {
  const totalMicroUsd = usersTotalMicroUsd + programmaticUsageTotalMicroUsd;
  const totalConsumedMicroUsd =
    usersConsumedMicroUsd + programmaticUsageConsumedMicroUsd;
  const usersPercentage =
    totalMicroUsd > 0 && totalConsumedMicroUsd > 0
      ? Math.min((totalConsumedMicroUsd / totalMicroUsd) * 100, 100) *
        (usersConsumedMicroUsd / totalConsumedMicroUsd)
      : 0;
  const programmaticUsagePercentage =
    totalMicroUsd > 0 && totalConsumedMicroUsd > 0
      ? Math.min((totalConsumedMicroUsd / totalMicroUsd) * 100, 100) *
        (programmaticUsageConsumedMicroUsd / totalConsumedMicroUsd)
      : 0;
  const totalConsumedPercentage = usersPercentage + programmaticUsagePercentage;

  return (
    <Page.Vertical gap="xs" align="stretch">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10"
        role="progressbar"
        aria-label="Users and programmatic usage"
        aria-valuenow={Math.round(totalConsumedPercentage)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full shrink-0 bg-yellow-400 transition-all"
          style={{ width: `${usersPercentage}%` }}
        />
        <div
          className="h-full shrink-0 bg-purple-500 transition-all"
          style={{ width: `${programmaticUsagePercentage}%` }}
        />
      </div>
      <div className="flex gap-4 text-xs text-muted-foreground dark:text-muted-foreground-night">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-yellow-400" />
          Users
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 bg-purple-500" />
          Programmatic Usage
        </span>
      </div>
    </Page.Vertical>
  );
}

export function UsagePage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const router = useAppRouter();

  useEffect(() => {
    if (!hasFeature("metronome_billing_usage_page")) {
      void router.push(`/w/${owner.sId}/members`);
    }
  }, [hasFeature, router, owner.sId]);

  const isMetronome = hasFeature("metronome_billing");
  const { credits: usersCredits, isCreditsLoading: isUsersCreditsLoading } =
    useCredits({
      workspaceId: owner.sId,
      metronomeCustomerId: isMetronome ? owner.metronomeCustomerId : null,
      metronomeBalanceCreditType: "users",
    });
  const {
    credits: programmaticUsageCredits,
    isCreditsLoading: isProgrammaticUsageCreditsLoading,
  } = useCredits({
    workspaceId: owner.sId,
    metronomeCustomerId: isMetronome ? owner.metronomeCustomerId : null,
    metronomeBalanceCreditType: "programmatic_usage",
  });

  const usersTotals = useMemo(
    () => getCreditTotals(usersCredits),
    [usersCredits]
  );
  const programmaticUsageTotals = useMemo(
    () => getCreditTotals(programmaticUsageCredits),
    [programmaticUsageCredits]
  );
  const totalConsumedMicroUsd =
    usersTotals.consumedMicroUsd + programmaticUsageTotals.consumedMicroUsd;
  const totalAmountMicroUsd =
    usersTotals.totalMicroUsd + programmaticUsageTotals.totalMicroUsd;

  const { billingCycleStartDay, isCreditPurchaseInfoLoading } =
    useCreditPurchaseInfo({ workspaceId: owner.sId });

  const isLoading =
    isUsersCreditsLoading ||
    isProgrammaticUsageCreditsLoading ||
    isCreditPurchaseInfoLoading;
  const resetDateLabel = getResetDateLabel(billingCycleStartDay ?? null);

  if (!hasFeature("metronome_billing_usage_page")) {
    return null;
  }

  return (
    <Page.Vertical gap="xl" align="stretch">
      <Page.Vertical gap="xs">
        <Icon
          visual={ActionPieChartIcon}
          className="text-muted-foreground dark:text-muted-foreground-night"
          size="lg"
        />
        <Page.H variant="h3">Usage</Page.H>
        <Page.P variant="secondary">
          Manage the usage of your Dust workspace
        </Page.P>
      </Page.Vertical>

      <Page.Vertical gap="sm" align="stretch">
        <div className="flex items-center justify-between">
          <span className="text-[16px] font-medium leading-[24px] tracking-[-0.32px] text-foreground dark:text-foreground-night">
            Credit pool
          </span>
          {!isLoading && (
            <span className="text-[18px] font-semibold leading-[26px] tracking-[-0.36px] text-foreground dark:text-foreground-night">
              {formatAmount(totalConsumedMicroUsd)} /{" "}
              {formatAmount(totalAmountMicroUsd)}
            </span>
          )}
        </div>

        {resetDateLabel && !isLoading && (
          <Page.P variant="secondary">{resetDateLabel}</Page.P>
        )}

        {!isLoading && (
          <CreditPoolUsageBar
            usersConsumedMicroUsd={usersTotals.consumedMicroUsd}
            usersTotalMicroUsd={usersTotals.totalMicroUsd}
            programmaticUsageConsumedMicroUsd={
              programmaticUsageTotals.consumedMicroUsd
            }
            programmaticUsageTotalMicroUsd={
              programmaticUsageTotals.totalMicroUsd
            }
          />
        )}

        {isLoading && (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        )}
      </Page.Vertical>

      {/* TODO: Settings section*/}
      <div />

      {/* TODO: Notifications section */}
      <div />

      {/* TODO: Members section */}
      <div />
    </Page.Vertical>
  );
}
