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
import type Stripe from "stripe";

import { subNavigationAdmin } from "@app/components/navigation/config";
import { AppCenteredLayout } from "@app/components/sparkle/AppCenteredLayout";
import AppRootLayout from "@app/components/sparkle/AppRootLayout";
import { BuyCreditDialog } from "@app/components/workspace/BuyCreditDialog";
import { CreditHistorySheet } from "@app/components/workspace/CreditHistorySheet";
import { CreditsList, isExpired } from "@app/components/workspace/CreditsList";
import { ProgrammaticCostChart } from "@app/components/workspace/ProgrammaticCostChart";
import {
  getBillingCycle,
  getPriceAsString,
} from "@app/lib/client/subscription";
import type { CreditPurchaseLimits } from "@app/lib/credits/limits";
import { getCreditPurchaseLimits } from "@app/lib/credits/limits";
import { withDefaultUserAuthRequirements } from "@app/lib/iam/session";
import {
  getCreditPurchasePriceId,
  getStripePricingData,
  getStripeSubscription,
  isEnterpriseSubscription,
} from "@app/lib/plans/stripe";
import { ProgrammaticUsageConfigurationResource } from "@app/lib/resources/programmatic_usage_configuration_resource";
import { useCredits } from "@app/lib/swr/credits";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { StripePricingData } from "@app/lib/types/stripe/pricing";
import type { SubscriptionType, WorkspaceType } from "@app/types";
import type { CreditDisplayData, CreditType } from "@app/types/credits";
import { isSupportedCurrency } from "@app/types/currency";

export const getServerSideProps = withDefaultUserAuthRequirements<{
  owner: WorkspaceType;
  subscription: SubscriptionType;
  isEnterprise: boolean;
  currency: string;
  discountPercent: number;
  creditPricing: StripePricingData | null;
  creditPurchaseLimits: CreditPurchaseLimits | null;
  stripeSubscription: Stripe.Subscription | null;
}>(async (context, auth) => {
  const owner = auth.getNonNullableWorkspace();
  const subscription = auth.getNonNullableSubscription();

  if (!auth.isAdmin()) {
    return { notFound: true };
  }

  let isEnterprise = false;
  let currency = "usd";
  let creditPurchaseLimits: CreditPurchaseLimits | null = null;

  let stripeSubscription: Stripe.Subscription | null = null;
  if (subscription.stripeSubscriptionId) {
    stripeSubscription = await getStripeSubscription(
      subscription.stripeSubscriptionId
    );
    if (stripeSubscription) {
      isEnterprise = isEnterpriseSubscription(stripeSubscription);
      currency = isSupportedCurrency(stripeSubscription.currency)
        ? stripeSubscription.currency
        : "usd";
      creditPurchaseLimits = await getCreditPurchaseLimits(
        auth,
        stripeSubscription
      );
    }
  }

  const programmaticConfig =
    await ProgrammaticUsageConfigurationResource.fetchByWorkspaceId(auth);
  const discountPercent = programmaticConfig?.defaultDiscountPercent ?? 0;

  const creditPricing = await getStripePricingData(getCreditPurchasePriceId());

  return {
    props: {
      owner,
      subscription,
      isEnterprise,
      currency,
      discountPercent,
      creditPricing,
      creditPurchaseLimits,
      stripeSubscription,
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

function formatDateShort(date: Date): string {
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatExpirationDate(timestamp: number | null): string | null {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  return `Expires ${formatDateShort(date)}`;
}

function formatRenewalDate(timestamp: number | null): string | null {
  if (!timestamp) {
    return null;
  }
  const date = new Date(timestamp);
  return `Renews ${formatDateShort(date)}`;
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
  const billingCycle = useMemo(() => {
    if (!subscription.startDate) {
      return null;
    }
    return getBillingCycle(subscription.startDate);
  }, [subscription.startDate]);

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
        <Page.H variant="h5">Available credits</Page.H>
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
          title="Free credits"
          consumed={creditsByType.free.consumed}
          total={creditsByType.free.total}
          renewalDate={formatRenewalDate(
            billingCycle?.cycleEnd.getTime() ?? null
          )}
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
  creditPurchaseLimits,
  stripeSubscription,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });
  const { credits, isCreditsLoading } = useCredits({
    workspaceId: owner.sId,
  });

  // Get the billing cycle start day from Stripe subscription, fallback to Dust subscription
  const getBillingCycleStartDay = (): number | null => {
    if (stripeSubscription?.current_period_start) {
      return new Date(stripeSubscription.current_period_start * 1000).getDate();
    }
    if (subscription.startDate) {
      return new Date(subscription.startDate).getDate();
    }
    return null;
  };
  const billingCycleStartDay = getBillingCycleStartDay();

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

  const shouldShowLowCreditsWarning = useMemo(() => {
    if (totalCredits === 0) {
      return false;
    }
    const percentUsed = (totalConsumed / totalCredits) * 100;
    return percentUsed >= 80;
  }, [totalConsumed, totalCredits]);

  const [activeCredits, expiredCredits] = useMemo(() => {
    return credits.reduce<[CreditDisplayData[], CreditDisplayData[]]>(
      ([active, expired], current) => {
        if (!isExpired(current)) {
          active.push(current);
        } else {
          expired.push(current);
        }
        return [active, expired];
      },
      [[], []]
    );
  }, [credits]);

  return (
    <AppCenteredLayout
      owner={owner}
      subscription={subscription}
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
        creditPurchaseLimits={creditPurchaseLimits}
      />

      <Page.Vertical gap="xl" align="stretch">
        <Page.Header
          title="Programmatic Usage"
          icon={CardIcon}
          description={
            <div>
              <p>
                Monitor usage and credits for programmatic usage (API keys,
                automated workflows, etc.). Usage cost is based on token
                consumption, according to our{" "}
                <a
                  href="https://dust-tt.notion.site/API-Pricing-12928599d941805a89dedeed342aacd5"
                  target="_blank"
                  className="text-primary underline hover:text-primary-dark"
                >
                  pricing page
                </a>
                . Learn more in the{" "}
                <a
                  href="https://dust-tt.notion.site/Programmatic-usage-at-Dust-2b728599d94181ceb124d8585f794e2e?pvs=74"
                  target="_blank"
                  className="text-primary underline hover:text-primary-dark"
                >
                  programmatic usage documentation
                </a>
                .
              </p>
            </div>
          }
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
        {creditPurchaseLimits &&
          !creditPurchaseLimits.canPurchase &&
          creditPurchaseLimits.reason === "trialing" && (
            <ContentMessage title="Available after trial" variant="info">
              Credit purchases are available once you upgrade to a paid plan. If
              you would like to purchase credits before upgrading, please
              contact support.
            </ContentMessage>
          )}

        {creditPurchaseLimits &&
          !creditPurchaseLimits.canPurchase &&
          creditPurchaseLimits.reason === "payment_issue" && (
            <ContentMessage title="Subscription issue" variant="warning">
              Credit purchases require an active subscription. Please ensure
              your payment method is up to date.
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

        {/* Current Credits Section */}
        <Page.Vertical sizing="grow">
          <div className="flex w-full items-start justify-between">
            <Page.Vertical gap="sm" sizing="grow">
              <div className="flex w-full items-center justify-between">
                <Page.H variant="h5">Current credits</Page.H>
                <CreditHistorySheet
                  credits={expiredCredits}
                  isLoading={isCreditsLoading}
                />
              </div>
              <Page.P variant="secondary">
                Active credits for programmatic usage. Credits invoices are sent
                by email at time of purchase.
              </Page.P>
            </Page.Vertical>
          </div>
          <CreditsList credits={activeCredits} isLoading={isCreditsLoading} />
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
