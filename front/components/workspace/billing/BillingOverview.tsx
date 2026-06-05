import { CancelMetronomeSubscriptionDialog } from "@app/components/pages/workspace/subscription/MetronomeSubscriptionPanel";
import {
  useCancelMetronomeContract,
  useReactivateMetronomeContract,
} from "@app/hooks/useMetronomeContractLifecycleAction";
import { getPriceAsString } from "@app/lib/client/subscription";
import { useSubmitFunction } from "@app/lib/client/utils";
import { isBusinessPlanPrefix } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useMetronomeInvoice } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { SubscriptionType } from "@app/types/plan";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import {
  Button,
  Calendar,
  ClockRewind,
  Icon,
  Spinner,
  Upload01,
} from "@dust-tt/sparkle";
import { useState } from "react";

interface BillingOverviewProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

function formatBillingPeriod(period: string): string {
  return period.charAt(0).toUpperCase() + period.slice(1);
}

export function BillingOverview({ owner, subscription }: BillingOverviewProps) {
  const router = useAppRouter();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { invoice, isMetronomeInvoiceLoading } = useMetronomeInvoice({
    workspaceId: owner.sId,
    disabled: !subscription.metronomeContractId,
  });
  const { cancelMetronomeContract, isCancellingMetronomeContract } =
    useCancelMetronomeContract({
      workspaceId: owner.sId,
    });
  const { reactivateMetronomeContract, isReactivatingMetronomeContract } =
    useReactivateMetronomeContract({
      workspaceId: owner.sId,
    });
  const { submit: cancelSubscription, isSubmitting: isCancelling } =
    useSubmitFunction(async () => {
      try {
        const success = await cancelMetronomeContract();
        if (success) {
          router.reload();
        }
      } finally {
        setShowCancelDialog(false);
      }
    });
  const { submit: reactivateSubscription, isSubmitting: isReactivating } =
    useSubmitFunction(async () => {
      const success = await reactivateMetronomeContract();
      if (success) {
        router.reload();
      }
    });

  const isCancellablePlan =
    isSubscriptionMetronomeBilled(subscription) &&
    isBusinessPlanPrefix(subscription.plan.code);
  const isCancellationScheduled =
    subscription.endDate !== null || subscription.requestCancelAt !== null;
  const subscriptionEndsAtMs =
    subscription.endDate ??
    (isCancellationScheduled ? (invoice?.currentPeriodEndMs ?? null) : null);
  const canCancelSubscription = isCancellablePlan && !isCancellationScheduled;
  const canReactivateSubscription =
    isCancellablePlan &&
    isCancellationScheduled &&
    subscriptionEndsAtMs !== null &&
    subscriptionEndsAtMs > Date.now();
  const isCancellingSubscription =
    isCancelling || isCancellingMetronomeContract;
  const isReactivatingSubscription =
    isReactivating || isReactivatingMetronomeContract;
  const periodEndLabel = invoice
    ? formatTimestampToFriendlyDate(invoice.currentPeriodEndMs, "short")
    : null;
  const subscriptionEndLabel = subscriptionEndsAtMs
    ? formatTimestampToFriendlyDate(subscriptionEndsAtMs, "short")
    : null;

  if (isMetronomeInvoiceLoading) {
    return (
      <div className="w-full rounded-lg bg-muted-background p-6 dark:bg-muted-background-night">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <CancelMetronomeSubscriptionDialog
        show={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onValidate={cancelSubscription}
        isSaving={isCancellingSubscription}
        periodEndLabel={periodEndLabel}
      />

      <div className="flex flex-col gap-4 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-base font-semibold text-foreground dark:text-foreground-night">
              {subscription.plan.name}
            </div>
            <div
              className={
                isCancellationScheduled
                  ? "rounded-md bg-warning-100 px-2 py-1 text-xs text-warning-900 dark:bg-warning-100-night dark:text-warning-900-night"
                  : "rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-900 dark:bg-gray-100-night dark:text-gray-900-night"
              }
            >
              {isCancellationScheduled ? "Cancelled" : "Current"}
            </div>
          </div>
          {canReactivateSubscription ? (
            <Button
              label="Resume subscription"
              size="sm"
              variant="highlight"
              disabled={isReactivatingSubscription}
              onClick={withTracking(
                TRACKING_AREAS.AUTH,
                "subscription_reactivate",
                () => {
                  void reactivateSubscription();
                }
              )}
            />
          ) : canCancelSubscription ? (
            <Button
              label="Cancel subscription"
              size="sm"
              variant="outline"
              disabled={isCancellingSubscription}
              onClick={withTracking(
                TRACKING_AREAS.AUTH,
                "subscription_cancel",
                () => {
                  setShowCancelDialog(true);
                }
              )}
            />
          ) : null}
        </div>

        {invoice ? (
          <div className="flex flex-col gap-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
            {subscriptionEndLabel && (
              <div className="flex items-center gap-2 font-semibold text-foreground dark:text-foreground-night">
                <Icon visual={Calendar} size="xs" />
                <span>Subscription end: {subscriptionEndLabel}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Icon visual={ClockRewind} size="xs" />
              <span>
                Frequency: {formatBillingPeriod(invoice.billingPeriod)}
              </span>
            </div>
            {!isCancellationScheduled && (
              <div className="flex items-center gap-2">
                <Icon visual={Calendar} size="xs" />
                <span>
                  Next billing date:{" "}
                  {formatTimestampToFriendlyDate(
                    invoice.currentPeriodEndMs,
                    "short"
                  )}
                </span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Icon visual={Upload01} size="xs" />
              <span>
                Amount:{" "}
                {getPriceAsString({
                  currency: invoice.currency,
                  priceInCents: invoice.estimatedAmountCents,
                })}
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-muted-foreground dark:text-muted-foreground-night">
            No billing information available for this period yet.
          </div>
        )}
      </div>
    </>
  );
}
