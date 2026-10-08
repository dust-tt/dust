import {
  ConsumptionProgressBar,
  ConsumptionProgressBarWithNumbers,
} from "@app/components/pages/workspace/developers/ConsumptionProgressBar";
import { BuyCreditDialog } from "@app/components/workspace/BuyCreditDialog";
import { CreditHistorySheet } from "@app/components/workspace/CreditHistorySheet";
import { CreditsList, isExpired } from "@app/components/workspace/CreditsList";
import { ProgrammaticCostChart } from "@app/components/workspace/ProgrammaticCostChart";
import { useAuth, useWorkspace } from "@app/lib/auth/AuthContext";
import {
  getBillingCycle,
  getPriceAsString,
} from "@app/lib/client/subscription";
import { formatDate } from "@app/lib/i18n/format";
import { useCreditPurchaseInfo, useCredits } from "@app/lib/swr/credits";
import type { CreditDisplayData, CreditType } from "@app/types/credits";
import type { SubscriptionType } from "@app/types/plan";
import {
  AlertCircle,
  Button,
  ContentMessage,
  Hoverable,
  LoadingBlock,
  Page,
} from "@dust-tt/sparkle";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { useMemo } from "react";

// A credit is active if it has started and has not expired.
// This need to be consistent with logic in CreditResource.listActive().
function isActive(credit: CreditDisplayData): boolean {
  const now = Date.now();
  const isStarted = credit.startDate !== null && credit.startDate <= now;
  const isExpired =
    credit.expirationDate !== null && credit.expirationDate <= now;
  return isStarted && !isExpired;
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
        <p className="my-1 text-sm text-muted-foreground">{title}</p>
        {action}
      </div>
      <div className="text-lg font-semibold text-foreground">
        {consumedFormatted}
        <span className="text-sm font-normal text-muted-foreground">
          {isCap ? (
            <Trans>/ {totalFormatted} cap</Trans>
          ) : (
            `/ ${totalFormatted}`
          )}
        </span>
      </div>
      <ConsumptionProgressBar consumed={consumed} total={total} />
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
  freeCreditRenewalDateMs: number | null;
  isLoading: boolean;
  onOpenBuyCreditDialog: () => void;
}

function formatDateShort(date: Date): string {
  return formatDate(date, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function UsageSection({
  subscription,
  isEnterprise,
  creditsByType,
  totalConsumed,
  totalCredits,
  freeCreditRenewalDateMs,
  isLoading,
  onOpenBuyCreditDialog,
}: UsageSectionProps) {
  const { t } = useLingui();
  const billingCycle = useMemo(() => {
    if (!subscription.startDate) {
      return null;
    }
    return getBillingCycle(subscription.startDate);
  }, [subscription.startDate]);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 rounded-lg border border-border p-6">
        <LoadingBlock className="h-8 w-32" />
        <LoadingBlock className="h-24 w-full" />
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

  const formatExpirationDate = (timestamp: number | null): string | null => {
    if (!timestamp) {
      return null;
    }
    const date = formatDateShort(new Date(timestamp));
    return t`Expires ${date}`;
  };

  const formatRenewalDate = (timestamp: number | null): string | null => {
    if (!timestamp) {
      return null;
    }
    const date = formatDateShort(new Date(timestamp));
    return t`Renews ${date}`;
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <Page.H variant="h5">
          <Trans>Available credits</Trans>
        </Page.H>
        {billingCycle && (
          <Page.P variant="secondary">
            {formatDateShort(billingCycle.cycleStart)} →{" "}
            {formatDateShort(
              new Date(billingCycle.cycleEnd.getTime() - 24 * 60 * 60 * 1000)
            )}
          </Page.P>
        )}
      </div>

      <ConsumptionProgressBarWithNumbers
        consumed={totalConsumed}
        total={totalCredits}
        consumedFormatted={totalConsumedFormatted}
        totalFormatted={totalCreditsFormatted}
      />

      <div className="grid grid-cols-3 gap-8 border-t border-border pt-6">
        <CreditCategoryBar
          title={t`Free credits`}
          consumed={creditsByType.free.consumed}
          total={creditsByType.free.total}
          renewalDate={formatRenewalDate(
            freeCreditRenewalDateMs ?? billingCycle?.cycleEnd.getTime() ?? null
          )}
        />
        <CreditCategoryBar
          title={t`Purchased credits`}
          consumed={creditsByType.committed.consumed}
          total={creditsByType.committed.total}
          renewalDate={formatExpirationDate(
            creditsByType.committed.expirationDate
          )}
          action={
            <Button
              label={t`Buy credits`}
              variant="outline"
              size="xs"
              onClick={onOpenBuyCreditDialog}
            />
          }
        />
        {isEnterprise && (
          <CreditCategoryBar
            title={t`Pay-as-you-go`}
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

interface LegacyProgrammaticUsagePanelProps {
  isBuyCreditDialogOpen: boolean;
  onBuyCreditDialogOpenChange: (open: boolean) => void;
  /**
   * Skip credit fetches while the hosting tab is inactive.
   */
  disabled?: boolean;
  /**
   * When false, omit the standalone page header (used when embedded as a tab).
   */
  showHeader?: boolean;
}

/**
 * Legacy (non–credit-priced) programmatic usage UI: available credits,
 * purchase dialog, credit list, and cost chart.
 */
export function LegacyProgrammaticUsagePanel({
  isBuyCreditDialogOpen,
  onBuyCreditDialogOpenChange,
  disabled = false,
  showHeader = true,
}: LegacyProgrammaticUsagePanelProps) {
  const { t } = useLingui();
  const owner = useWorkspace();
  const { subscription } = useAuth();
  // Keep fetches alive while the buy dialog is open so the header CTA can
  // open it from another tab without empty purchase info.
  const fetchDisabled = disabled && !isBuyCreditDialogOpen;
  const { credits, pendingCredits, freeCreditRenewalDateMs, isCreditsLoading } =
    useCredits({ workspaceId: owner.sId, disabled: fetchDisabled });
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
    disabled: fetchDisabled,
  });

  const openBuyCreditDialog = () => onBuyCreditDialogOpenChange(true);

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
        isOpen={isBuyCreditDialogOpen}
        onClose={() => onBuyCreditDialogOpenChange(false)}
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
        {showHeader && (
          <Page.Header
            title={t`Programmatic Usage`}
            description={
              <div>
                <p>
                  <Trans>
                    Monitor usage and credits for programmatic usage (API keys,
                    automated workflows, etc.). Learn more in the{" "}
                    <Hoverable
                      href="https://docs.dust.tt/docs/programmatic-usage"
                      target="_blank"
                      variant="primary"
                    >
                      usage documentation
                    </Hoverable>
                    .
                  </Trans>
                </p>
              </div>
            }
          />
        )}

        {!showHeader && (
          <Page.P variant="secondary">
            <Trans>
              Monitor usage and credits for programmatic usage (API keys,
              automated workflows, etc.). Learn more in the{" "}
              <Hoverable
                href="https://docs.dust.tt/docs/programmatic-usage"
                target="_blank"
                variant="primary"
              >
                usage documentation
              </Hoverable>
              .
            </Trans>
          </Page.P>
        )}

        {shouldShowLowCreditsWarning && (
          <ContentMessage
            title={
              totalConsumed < totalCredits
                ? t`You're almost out of credits.`
                : t`You're out of credits.`
            }
            variant="warning"
            size="lg"
            icon={AlertCircle}
          >
            <div className="flex items-end justify-between">
              <p>
                <Trans>Add credits to ensure uninterrupted usage.</Trans>
              </p>
              <Button
                label={t`Buy credits`}
                variant="primary"
                onClick={openBuyCreditDialog}
              />
            </div>
          </ContentMessage>
        )}

        {/* Purposefully not giving email since we want to test determination here and limit support requests, it's a very edgy case and most likely fraudulent. */}
        {creditPurchaseLimits &&
          !creditPurchaseLimits.canPurchase &&
          creditPurchaseLimits.reason === "trialing" && (
            <ContentMessage title={t`Available after trial`} variant="info">
              <Trans>
                Credit purchases are available once you upgrade to a paid plan.
                If you would like to purchase credits before upgrading, please
                contact support.
              </Trans>
            </ContentMessage>
          )}

        {creditPurchaseLimits &&
          !creditPurchaseLimits.canPurchase &&
          creditPurchaseLimits.reason === "payment_issue" && (
            <ContentMessage title={t`Subscription issue`} variant="warning">
              <Trans>
                Credit purchases require an active subscription. Please ensure
                your payment method is up to date.
              </Trans>
            </ContentMessage>
          )}

        {pendingCredits.length > 0 &&
          (() => {
            const totalPendingMicroUsd = pendingCredits.reduce(
              (sum, c) => sum + c.initialAmountMicroUsd,
              0
            );
            const isSingle = pendingCredits.length === 1;
            const pendingCount = pendingCredits.length;
            const totalPending = getPriceAsString({
              currency: "usd",
              priceInMicroUsd: totalPendingMicroUsd,
            });
            const title = t`${plural(pendingCount, {
              one: `You have a pending ${totalPending} credit purchase awaiting payment.`,
              other: `You have # pending credit purchases totaling ${totalPending} awaiting payment.`,
            })}`;

            return (
              <ContentMessage
                title={title}
                variant="info"
                size="lg"
                icon={AlertCircle}
              >
                <div className="flex items-end justify-between">
                  <p>
                    <Trans>
                      Complete your payment to activate your credits.
                    </Trans>
                  </p>
                  <Button
                    label={isSingle ? t`Complete payment` : t`Manage invoices`}
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

        <UsageSection
          subscription={subscription}
          isEnterprise={isEnterprise}
          creditsByType={creditsByType}
          totalConsumed={totalConsumed}
          totalCredits={totalCredits}
          freeCreditRenewalDateMs={freeCreditRenewalDateMs}
          isLoading={isCreditsLoading || isCreditPurchaseInfoLoading}
          onOpenBuyCreditDialog={openBuyCreditDialog}
        />

        <Page.Vertical sizing="grow">
          <div className="flex w-full items-start justify-between">
            <Page.Vertical gap="sm" sizing="grow">
              <div className="flex w-full items-center justify-between">
                <Page.H variant="h5">
                  <Trans>Current credits</Trans>
                </Page.H>
                <CreditHistorySheet
                  credits={expiredCredits}
                  isLoading={isCreditsLoading}
                />
              </div>
              <Page.P variant="secondary">
                <Trans>
                  Active credits for programmatic usage. Credits invoices are
                  sent by email at time of purchase.
                </Trans>
              </Page.P>
            </Page.Vertical>
          </div>
          <CreditsList credits={activeCredits} isLoading={isCreditsLoading} />
        </Page.Vertical>

        {isCreditPurchaseInfoLoading ? (
          <LoadingBlock className="h-64" />
        ) : (
          <ProgrammaticCostChart
            workspaceId={owner.sId}
            billingCycleStartDay={billingCycleStartDay ?? 1}
          />
        )}
      </Page.Vertical>
    </>
  );
}
