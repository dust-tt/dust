import { Button, CardIcon, ContentMessage, Page } from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import React, { useMemo, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import { BuyCreditDialog } from "@app/components/workspace/BuyCreditDialog";
import { CreditsList } from "@app/components/workspace/CreditsList";
import { ProgrammaticCostChart } from "@app/components/workspace/ProgrammaticCostChart";
import { getFeatureFlags } from "@app/lib/auth";
import { getPriceAsString } from "@app/lib/client/subscription";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import { isEntreprisePlan } from "@app/lib/plans/plan_codes";
import { useCredits, usePurchaseCredits } from "@app/lib/swr/credits";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SubscriptionType, WorkspaceType } from "@app/types";
import type { CreditDisplayData, CreditType } from "@app/types/credits";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  if (!auth.isAdmin()) {
    return { notFound: true };
  }

  // Check if the feature flag is enabled
  const featureFlags = await getFeatureFlags(owner);
  if (!featureFlags.includes("ppul")) {
    return { notFound: true };
  }

  return {
    props: {
      owner,
      subscription,
    },
  };
});

function isExpired(credit: CreditDisplayData): boolean {
  const now = Date.now();
  return credit.expirationDate !== null && credit.expirationDate <= now;
}

interface ProgressBarProps {
  consumed: number;
  total: number;
}

function ProgressBar({ consumed, total }: ProgressBarProps) {
  const percentage = total > 0 ? Math.min((consumed / total) * 100, 100) : 0;

  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10">
      <div
        className={`h-full rounded-full bg-primary transition-all dark:bg-primary-night`}
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

interface CreditCategoryBarProps {
  title: string;
  consumed: number;
  total: number;
  renewalDate: string | null;
  isCap?: boolean;
}

function CreditCategoryBar({
  title,
  consumed,
  total,
  renewalDate,
  isCap = false,
}: CreditCategoryBarProps) {
  const consumedFormatted = getPriceAsString({
    currency: "usd",
    priceInCents: consumed,
  });
  const totalFormatted = getPriceAsString({
    currency: "usd",
    priceInCents: total,
  });

  return (
    <Page.Vertical sizing="grow">
      <Page.P variant="secondary">{title}</Page.P>
      <div className="text-lg font-semibold text-foreground dark:text-foreground-night">
        {consumedFormatted}
        <span className="font-normal text-muted-foreground dark:text-muted-foreground-night">
          / {totalFormatted}
          {isCap ? " cap" : ""}
        </span>
      </div>
      <ProgressBar consumed={consumed} total={total} />
      {renewalDate && <Page.P variant="secondary">{renewalDate}</Page.P>}
    </Page.Vertical>
  );
}

interface UsageSectionProps {
  credits: CreditDisplayData[];
  isLoading: boolean;
}

function UsageSection({ credits, isLoading }: UsageSectionProps) {
  const creditsByType = useMemo(() => {
    const activeCredits = credits.filter((c) => !isExpired(c));

    const byType: Record<
      CreditType,
      { consumed: number; total: number; expirationDate: number | null }
    > = {
      free: { consumed: 0, total: 0, expirationDate: null },
      committed: { consumed: 0, total: 0, expirationDate: null },
      payg: { consumed: 0, total: 0, expirationDate: null },
    };

    for (const credit of activeCredits) {
      byType[credit.type].consumed += credit.consumedAmount;
      byType[credit.type].total += credit.initialAmount;
      // Keep the earliest expiration date for each type
      if (credit.expirationDate) {
        if (
          !byType[credit.type].expirationDate ||
          credit.expirationDate < byType[credit.type].expirationDate!
        ) {
          byType[credit.type].expirationDate = credit.expirationDate;
        }
      }
    }

    return byType;
  }, [credits]);

  const totalConsumed = useMemo(() => {
    return (
      creditsByType.free.consumed +
      creditsByType.committed.consumed +
      creditsByType.payg.consumed
    );
  }, [creditsByType]);

  const totalCredits = useMemo(() => {
    return (
      creditsByType.free.total +
      creditsByType.committed.total +
      creditsByType.payg.total
    );
  }, [creditsByType]);

  // Get current billing period dates (month boundaries)
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const formatDateShort = (date: Date) => {
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  const formatExpirationDate = (timestamp: number | null) => {
    if (!timestamp) {
      return null;
    }
    return `Expires on ${new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  };

  const formatRenewalDate = (timestamp: number | null) => {
    if (!timestamp) {
      return null;
    }
    return `Renews on ${new Date(timestamp).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    })}`;
  };

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 rounded-lg border border-border p-6 dark:border-border-night">
        <div className="h-8 w-32 animate-pulse rounded bg-muted-foreground/20" />
        <div className="h-24 w-full animate-pulse rounded bg-muted-foreground/20" />
      </div>
    );
  }

  const totalConsumedFormatted = getPriceAsString({
    currency: "usd",
    priceInCents: totalConsumed,
  });
  const totalCreditsFormatted = getPriceAsString({
    currency: "usd",
    priceInCents: totalCredits,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Usage Header */}
      <div className="flex items-center justify-between">
        <Page.Vertical>
          <Page.H variant="h5">Usage</Page.H>
          <Page.P variant="secondary">Available credits and consumption</Page.P>
        </Page.Vertical>
        <Page.P variant="secondary">
          {formatDateShort(startOfMonth)} → {formatDateShort(endOfMonth)}
        </Page.P>
      </div>

      {/* Total Consumed */}
      <Page.Vertical>
        <Page.P variant="secondary">Total consumed</Page.P>
        <div className="flex items-baseline gap-2">
          <span className="text-5xl font-bold">{totalConsumedFormatted}</span>
          <span className="text-2xl text-muted-foreground dark:text-muted-foreground-night">
            /{totalCreditsFormatted}
          </span>
        </div>
        <ProgressBar consumed={totalConsumed} total={totalCredits} />
      </Page.Vertical>

      {/* Credit Categories */}
      <div className="flex gap-8 border-t border-border pt-6 dark:border-border-night">
        <CreditCategoryBar
          title="Monthly included credits"
          consumed={creditsByType.free.consumed}
          total={creditsByType.free.total}
          renewalDate={formatRenewalDate(creditsByType.free.expirationDate)}
        />
        <CreditCategoryBar
          title="Purchased credits"
          consumed={creditsByType.committed.consumed}
          total={creditsByType.committed.total}
          renewalDate={formatExpirationDate(
            creditsByType.committed.expirationDate
          )}
        />
        <CreditCategoryBar
          title="Pay-as-you-go"
          consumed={creditsByType.payg.consumed}
          total={creditsByType.payg.total}
          renewalDate={formatRenewalDate(creditsByType.payg.expirationDate)}
          isCap
        />
      </div>
    </div>
  );
}

export default function CreditsUsagePage({
  owner,
  subscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);
  const { hasFeature, featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });

  const isEnterprise = isEntreprisePlan(subscription.plan.code);
  const isApiAndProgrammaticEnabled = hasFeature("ppul");
  const { credits, isCreditsLoading } = useCredits({
    workspaceId: owner.sId,
    disabled: !isApiAndProgrammaticEnabled,
  });
  const { isLoading: isPurchasingCredits } = usePurchaseCredits({
    workspaceId: owner.sId,
  });

  return (
    <AppCenteredLayout
      subscription={subscription}
      owner={owner}
      subNavigation={subNavigationAdmin({
        owner,
        current: "credits_usage",
        featureFlags,
      })}
    >
      <BuyCreditDialog
        isOpen={showBuyCreditDialog}
        onClose={() => setShowBuyCreditDialog(false)}
        workspaceId={owner.sId}
        isEnterprise={isEnterprise}
      />

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Credits & Usage"
          icon={CardIcon}
          description="Monitor and manage your programmatic API usage credits."
        />

        <ContentMessage title="Need more credits?" variant="outline" size="lg">
          <div className="flex items-end justify-between">
            <p>Purchase additional credits for programmatic usage</p>
            <Button
              label="Buy credits"
              variant="primary"
              disabled={subscription.trialing || isPurchasingCredits}
              isLoading={isPurchasingCredits}
              onClick={() => setShowBuyCreditDialog(true)}
            />
          </div>
        </ContentMessage>

        {subscription.trialing && (
          <ContentMessage title="Available after trial" variant="info">
            Credit purchases are available once you upgrade to a paid plan.
          </ContentMessage>
        )}

        {/* Usage Section */}
        <UsageSection credits={credits} isLoading={isCreditsLoading} />

        {/* History Section */}
        <Page.Vertical>
          <Page.H variant="h5">History</Page.H>
          <Page.P>Credit history for programmatic API usage</Page.P>

          <CreditsList credits={credits} isLoading={isCreditsLoading} />
        </Page.Vertical>

        {/* Programmatic Cost Chart */}
        <ProgrammaticCostChart workspaceId={owner.sId} />
      </Page.Vertical>
      <div className="h-12" />
    </AppCenteredLayout>
  );
}
