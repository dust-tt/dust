import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { useAppRouter } from "@app/lib/platform";
import { useCredits } from "@app/lib/swr/credits";
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

export function UsagePage() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const router = useAppRouter();

  useEffect(() => {
    if (!hasFeature("metronome_billing_usage_page")) {
      void router.push(`/w/${owner.sId}/members`);
    }
  }, [hasFeature, router, owner.sId]);

  const { credits, isCreditsLoading } = useCredits({
    workspaceId: owner.sId,
    metronomeCustomerId: owner.metronomeCustomerId ?? null,
  });

  const { totalConsumedMicroUsd, totalAmountMicroUsd } = useMemo(() => {
    const activeCredits = credits.filter((c) => isActive(c));
    return {
      totalConsumedMicroUsd: activeCredits.reduce(
        (sum, c) => sum + c.consumedAmountMicroUsd,
        0
      ),
      totalAmountMicroUsd: activeCredits.reduce(
        (sum, c) => sum + c.initialAmountMicroUsd,
        0
      ),
    };
  }, [credits]);

  const isLoading = isCreditsLoading;

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
