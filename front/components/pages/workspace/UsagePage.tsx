import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useAwuPoolSummary } from "@app/lib/swr/credits";
import {
  ActionPieChartIcon,
  ContentMessage,
  ExclamationCircleIcon,
  Icon,
  Page,
  Spinner,
} from "@dust-tt/sparkle";
import { useEffect } from "react";

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

function getResetDateLabel(resetDate: string): string {
  if (!resetDate) {
    return "";
  }
  const date = new Date(resetDate);
  const resetDay = date.getUTCDate();
  const suffix = getOrdinalSuffix(resetDay);
  const resetMonth = date.toLocaleDateString(undefined, {
    month: "long",
    timeZone: "UTC",
  });
  return `Monthly resets on the ${resetDay}${suffix}, ${resetMonth}`;
}

interface CreditPoolUsageBarProps {
  totalAmountMicroUsd: number;
  consumedByUsersMicroUsd: number;
  consumedByProgrammaticMicroUsd: number;
}

function CreditPoolUsageBar({
  totalAmountMicroUsd,
  consumedByUsersMicroUsd,
  consumedByProgrammaticMicroUsd,
}: CreditPoolUsageBarProps) {
  const usersPercentage =
    totalAmountMicroUsd > 0
      ? Math.min((consumedByUsersMicroUsd / totalAmountMicroUsd) * 100, 100)
      : 0;
  const programmaticPercentage =
    totalAmountMicroUsd > 0
      ? Math.min(
          (consumedByProgrammaticMicroUsd / totalAmountMicroUsd) * 100,
          100 - usersPercentage
        )
      : 0;
  const totalConsumedPercentage = usersPercentage + programmaticPercentage;

  return (
    <Page.Vertical gap="xs" align="stretch">
      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10"
        role="progressbar"
        aria-label="User and programmatic usage"
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
          style={{ width: `${programmaticPercentage}%` }}
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

  const {
    totalAmountMicroUsd,
    consumedByUsersMicroUsd,
    consumedByProgrammaticMicroUsd,
    resetDate,
    isAwuPoolSummaryLoading,
    isAwuPoolSummaryError,
  } = useAwuPoolSummary({
    workspaceId: owner.sId,
    disabled: !isMetronome,
  });

  const totalConsumedMicroUsd =
    consumedByUsersMicroUsd + consumedByProgrammaticMicroUsd;

  const resetDateLabel = getResetDateLabel(resetDate);

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
          {!isAwuPoolSummaryLoading && (
            <span className="text-[18px] font-semibold leading-[26px] tracking-[-0.36px] text-foreground dark:text-foreground-night">
              {formatAmount(totalConsumedMicroUsd)} /{" "}
              {formatAmount(totalAmountMicroUsd)}
            </span>
          )}
        </div>

        {isAwuPoolSummaryError && (
          <ContentMessage
            title="Failed to load credit pool"
            icon={ExclamationCircleIcon}
            variant="warning"
          >
            An error occurred while loading your credit pool data. Please
            refresh the page or contact support if the issue persists.
          </ContentMessage>
        )}

        {resetDateLabel &&
          !isAwuPoolSummaryLoading &&
          !isAwuPoolSummaryError && (
            <Page.P variant="secondary">{resetDateLabel}</Page.P>
          )}

        {!isAwuPoolSummaryLoading && !isAwuPoolSummaryError && (
          <CreditPoolUsageBar
            totalAmountMicroUsd={totalAmountMicroUsd}
            consumedByUsersMicroUsd={consumedByUsersMicroUsd}
            consumedByProgrammaticMicroUsd={consumedByProgrammaticMicroUsd}
          />
        )}

        {isAwuPoolSummaryLoading && (
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
