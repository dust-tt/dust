import { BuyCreditDialog } from "@app/components/workspace/BuyCreditDialog";
import { CreditHistorySheet } from "@app/components/workspace/CreditHistorySheet";
import { CreditsList, isExpired } from "@app/components/workspace/CreditsList";
import { ProgrammaticCostChart } from "@app/components/workspace/ProgrammaticCostChart";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  getBillingCycle,
  getPriceAsString,
} from "@app/lib/client/subscription";
import { useCreditPurchaseInfo, useCredits } from "@app/lib/swr/credits";
import type { CreditDisplayData, CreditType } from "@app/types/credits";
import type { SubscriptionType } from "@app/types/plan";
import {
  Button,
  CardIcon,
  ContentMessage,
  cn,
  ExclamationCircleIcon,
  Hoverable,
  Page,
} from "@dust-tt/sparkle";
import { useMemo, useState } from "react";

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

export function CreditsUsagePage() {
  const owner = useWorkspace();
  const { subscription } = useAuth();
  const [showBuyCreditDialog, setShowBuyCreditDialog] = useState(false);
  const { credits, pendingCredits, isCreditsLoading } = useCredits({
    workspaceId: owner.sId,
  });
  const {
    isEnterprise,
    currency,
    discountPercent,
    creditPricing,
    creditPurchaseLimits,
    billingCycleStartDay,
    isCreditPurchaseInfoLoading,
  } = useCreditPurchaseInfo({
    workspaceId: owner.sId,
  });

  const creditsByType = useMemo(() => {
    const activeCredits = credits.filter((c) => isActive(c));

    const byType: Record<
      CreditType,
      { consumed: number; total: number; expirationDate: number | null }
    > = {
      free: { consumed: 0, total: 0, expirationDate: null },
      committed: { consumed: 0, total: 0, expirationDate: null },
      payg: { consumed: 0, total: 0, expirationDate: null },
      // Excess credits are filtered out in the API and should never appear here.
      excess: { consumed: 0, total: 0, expirationDate: null },
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
    <>
      <BuyCreditDialog
        isOpen={showBuyCreditDialog}
        onClose={() => setShowBuyCreditDialog(false)}
        workspaceId={owner.sId}
        isEnterprise={isEnterprise}
        currency={currency}
        discountPercent={discountPercent}
        creditPricing={creditPricing}
        creditPurchaseLimits={creditPurchaseLimits}
        paygUsage={
          isEnterprise
            ? {
                consumed: creditsByType.payg.consumed,
                total: creditsByType.payg.total,
              }
            : null
        }
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
                <Hoverable
                  href="/home/api-pricing"
                  target="_blank"
                  variant="primary"
                >
                  pricing page
                </Hoverable>
                . Learn more in the{" "}
                <Hoverable
                  href="https://docs.dust.tt/docs/programmatic-usage"
                  target="_blank"
                  variant="primary"
                >
                  programmatic usage documentation
                </Hoverable>
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

        {pendingCredits.length > 0 &&
          (() => {
            const totalPendingMicroUsd = pendingCredits.reduce(
              (sum, c) => sum + c.initialAmountMicroUsd,
              0
            );
            const isSingle = pendingCredits.length === 1;
            const title = isSingle
              ? `You have a pending ${getPriceAsString({ currency: "usd", priceInMicroUsd: totalPendingMicroUsd })} credit purchase awaiting payment.`
              : `You have ${pendingCredits.length} pending credit purchases totaling ${getPriceAsString({ currency: "usd", priceInMicroUsd: totalPendingMicroUsd })} awaiting payment.`;

            return (
              <ContentMessage
                title={title}
                variant="info"
                size="lg"
                icon={ExclamationCircleIcon}
              >
                <div className="flex items-end justify-between">
                  <p>Complete your payment to activate your credits.</p>
                  <Button
                    label={isSingle ? "Complete Payment" : "Manage Invoices"}
                    variant="primary"
                    onClick={() => {
                      window.open(
                        `/w/${owner.sId}/subscription/manage`,
                        "_blank"
                      );
                    }}
                  />
                </div>
              </ContentMessage>
            );
          })()}

        {/* Usage Section */}
        <UsageSection
          subscription={subscription}
          isEnterprise={isEnterprise}
          creditsByType={creditsByType}
          totalConsumed={totalConsumed}
          totalCredits={totalCredits}
          isLoading={isCreditsLoading || isCreditPurchaseInfoLoading}
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
        {isCreditPurchaseInfoLoading ? (
          <div className="h-64 animate-pulse rounded bg-muted-foreground/20" />
        ) : (
          <ProgrammaticCostChart
            workspaceId={owner.sId}
            billingCycleStartDay={billingCycleStartDay ?? 1}
          />
        )}
      </Page.Vertical>
      <div className="h-12" />
    </>
  );
}
