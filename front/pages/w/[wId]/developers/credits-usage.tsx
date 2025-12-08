import {
  Button,
  CardIcon,
  cn,
  ContentMessage,
  ExclamationCircleIcon,
  Page,
} from "@dust-tt/sparkle";
import type { InferGetServerSidePropsType } from "next";
import React, { useMemo, useState } from "react";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { BuyCreditDialog } from "@app/components/workspace/BuyCreditDialog";
import { CreditsList } from "@app/components/workspace/CreditsList";
import { ProgrammaticCostChart } from "@app/components/workspace/ProgrammaticCostChart";
import { getFeatureFlags } from "@app/lib/auth";
import {
  getBillingCycle,
  getPriceAsString,
} from "@app/lib/client/subscription";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  getCreditPurchasePricing,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import type { StripePricingData } from "@app/lib/types/stripe/pricing";
import { isSupportedCurrency } from "@app/types/currency";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { useCredits } from "@app/lib/swr/credits";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { SubscriptionType, WorkspaceType } from "@app/types";
import type { CreditDisplayData, CreditType } from "@app/types/credits";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isEnterprise: boolean;
  currency: string;
  discountPercent: number;
  creditPricing: StripePricingData | null;
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

  let isEnterprise = false;
  let currency = "usd";
  if (subscription.stripeSubscriptionId) {
    const stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (stripeSubscription) {
      isEnterprise = isEnterpriseSubscription(stripeSubscription);
      currency = isSupportedCurrency(stripeSubscription.currency)
        ? stripeSubscription.currency
        : "usd";
    }
  }

  const programmaticConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  const discountPercent = programmaticConfig?.defaultDiscountPercent ?? 0;

  const creditPricing = await getCreditPurchasePricing();

  return {
    props: {
      owner,
      subscription,
      isEnterprise,
      currency,
      discountPercent,
      creditPricing,
    },
  };
});

// A credit is active if it has started and has not expired.
// This need to be consistent with logic in CreditResource.listActive().
function isActive(credit: CreditDisplayData): boolean {
  const now = Date.now();
  const isStarted = credit.startDate !== null && credit.startDate <= now;
  const isExpired =
    credit.expirationDate !== null && credit.expirationDate <= now;
  return isStarted && !isExpired;
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
        className={cn(
          "h-full rounded-full transition-all",
          percentage > 80
            ? "bg-warning-700"
            : "bg-primary dark:bg-primary-night"
        )}
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
  action?: React.ReactNode;
  isCap?: boolean;
}

function CreditCategoryBar({
  title,
  consumed,
  total,
  renewalDate,
  action,
  isCap = false,
}: CreditCategoryBarProps) {
  const consumedFormatted = getPriceAsString({
    currency: "usd",
    priceInMicroUsd: consumed,
  });
  const totalFormatted = getPriceAsString({
    currency: "usd",
    priceInMicroUsd: total,
  });

  return (
    <Page.Vertical sizing="grow">
      <div className="flex w-full items-center justify-between">
        <p className="my-1 text-sm text-muted-foreground dark:text-muted-foreground-night">
          {title}
        </p>
        {action}
      </div>
      <div className="text-lg font-semibold text-foreground dark:text-foreground-night">
        {consumedFormatted}
        <span className="text-sm font-normal text-muted-foreground dark:text-muted-foreground-night">
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
  subscription: SubscriptionType;
  isEnterprise: boolean;
  creditsByType: Record<
    CreditType,
    { consumed: number; total: number; expirationDate: number | null }
  >;
  totalConsumed: number;
  totalCredits: number;
  isLoading: boolean;
  setShowBuyCreditDialog: (show: boolean) => void;
}

function UsageSection({
  subscription,
  isEnterprise,
  creditsByType,
  totalConsumed,
  totalCredits,
  isLoading,
  setShowBuyCreditDialog,
}: UsageSectionProps) {
  const billingCycle = useMemo(
    () => getBillingCycle(subscription.startDate),
    [subscription.startDate]
  );

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
    priceInMicroUsd: totalConsumed,
  });
  const totalCreditsFormatted = getPriceAsString({
    currency: "usd",
    priceInMicroUsd: totalCredits,
  });

  return (
    <div className="flex flex-col gap-6">
      {/* Usage Header */}
      <div className="flex items-center justify-between">
        <Page.Vertical gap="xs">
          <Page.H variant="h5">Available credits</Page.H>
        </Page.Vertical>
        {billingCycle && (
          <Page.P variant="secondary">
            {formatDateShort(billingCycle.cycleStart)} →{" "}
            {formatDateShort(
              new Date(billingCycle.cycleEnd.getTime() - 24 * 60 * 60 * 1000)
            )}
          </Page.P>
        )}
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
      <div className="grid grid-cols-3 gap-8 border-t border-border pt-6 dark:border-border-night">
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
          action={
            !subscription.trialing && (
              <Button
                label="Buy credits"
                variant="outline"
                size="xs"
                onClick={() => setShowBuyCreditDialog(true)}
              />
            )
          }
        />
        {isEnterprise && (
          <CreditCategoryBar
            title="Pay-as-you-go"
            consumed={creditsByType.payg.consumed}
            total={creditsByType.payg.total}
            renewalDate={formatRenewalDate(creditsByType.payg.expirationDate)}
            isCap
          />
        )}
      </div>
    </div>
  );
}

export default function CreditsUsagePage({
  owner,
  subscription,
  isEnterprise,
  currency,
  discountPercent,
  creditPricing,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);
  const { hasFeature, featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const isApiAndProgrammaticEnabled = hasFeature("ppul");
  const { credits, isCreditsLoading } = useCredits({
    workspaceId: owner.sId,
    disabled: !isApiAndProgrammaticEnabled,
  });

  // Get the billing cycle start day from the subscription start date
  const billingCycleStartDay = subscription.startDate
    ? new Date(subscription.startDate).getDate()
    : null;

  const creditsByType = useMemo(() => {
    const activeCredits = credits.filter((c) => isActive(c));

    const byType: Record<
      CreditType,
      { consumed: number; total: number; expirationDate: number | null }
    > = {
      free: { consumed: 0, total: 0, expirationDate: null },
      committed: { consumed: 0, total: 0, expirationDate: null },
      payg: { consumed: 0, total: 0, expirationDate: null },
    };

    for (const credit of activeCredits) {
      byType[credit.type].consumed += credit.consumedAmountMicroUsd;
      byType[credit.type].total += credit.initialAmountMicroUsd;

      // Keep the earliest expiration date for each type
      const currentExpiration = byType[credit.type].expirationDate;
      if (credit.expirationDate) {
        if (!currentExpiration || credit.expirationDate < currentExpiration) {
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

  const shouldShowLowCreditsWarning =
    !isCreditsLoading &&
    totalCredits > 0 &&
    totalConsumed >= totalCredits * 0.8;

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
        currency={currency}
        discountPercent={discountPercent}
        creditPricing={creditPricing}
      />

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Programmatic Usage"
          icon={CardIcon}
          description="Monitor usage and credits for your API keys and automated workflows."
        />

        {shouldShowLowCreditsWarning && (
          <ContentMessage
            title={`You're ${totalConsumed < totalCredits ? "almost" : ""} out of credits.`}
            variant="warning"
            size="lg"
            icon={ExclamationCircleIcon}
          >
            <div className="flex items-end justify-between">
              <p>Add credits to ensure uninterrupted usage.</p>
              <Button
                label="Buy credits"
                variant="primary"
                onClick={() => setShowBuyCreditDialog(true)}
              />
            </div>
          </ContentMessage>
        )}

        {/* Purposefully not giving email since we want to test determination here and limit support requests, it's a very edgy case and most likely fraudulent. */}
        {subscription.trialing && (
          <ContentMessage title="Available after trial" variant="info">
            Credit purchases are available once you upgrade to a paid plan. If
            you would like to purchase credits before upgrading, please contact
            support.
          </ContentMessage>
        )}

        {/* Usage Section */}
        <UsageSection
          subscription={subscription}
          isEnterprise={isEnterprise}
          creditsByType={creditsByType}
          totalConsumed={totalConsumed}
          totalCredits={totalCredits}
          isLoading={isCreditsLoading}
          setShowBuyCreditDialog={setShowBuyCreditDialog}
        />

        {/* History Section */}
        <Page.Vertical>
          <Page.Vertical gap="sm">
            <Page.H variant="h5">Credit history</Page.H>
            <Page.P variant="secondary">
              Credit history for programmatic usage. Credits invoices are sent
              by email at time of purchase.
            </Page.P>
          </Page.Vertical>
          <CreditsList credits={credits} isLoading={isCreditsLoading} />
        </Page.Vertical>

        {/* Usage Graph */}
        {billingCycleStartDay && (
          <ProgrammaticCostChart
            workspaceId={owner.sId}
            billingCycleStartDay={billingCycleStartDay}
          />
        )}
      </Page.Vertical>
      <div className="h-12" />
    </AppCenteredLayout>
  );
}

CreditsUsagePage.getLayout = (page: React.ReactElement) => {
  return <AppRootLayout>{page}</AppRootLayout>;
};
