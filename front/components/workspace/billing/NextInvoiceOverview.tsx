import { CancelMetronomeSubscriptionDialog } from "@app/components/pages/workspace/subscription/MetronomeSubscriptionPanel";
import {
  useCancelMetronomeContract,
  useReactivateMetronomeContract,
} from "@app/hooks/useMetronomeContractLifecycleAction";
import { useSubmitFunction } from "@app/lib/client/utils";
import { isBusinessPlanPrefix } from "@app/lib/plans/plan_codes";
import { useAppRouter } from "@app/lib/platform";
import { useMetronomeInvoice } from "@app/lib/swr/workspaces";
import { TRACKING_AREAS, withTracking } from "@app/lib/tracking";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type { SubscriptionType } from "@app/types/plan";
import { isSubscriptionMetronomeBilled } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import { Button, Spinner } from "@dust-tt/sparkle";
import { useState } from "react";
import { formatAmount } from "./seatTypeUtils";

type SubscriptionStatus = "active" | "cancelled" | "ended";

const STATUS_BADGE: Record<
  SubscriptionStatus,
  { badgeLabel: string; badgeClassName: string }
> = {
  active: {
    badgeLabel: "ACTIVE",
    badgeClassName:
      "rounded-md bg-blue-100 px-1.5 py-1 text-xs font-semibold text-blue-900 dark:bg-blue-100-night dark:text-blue-900-night",
  },
  cancelled: {
    badgeLabel: "CANCELLED",
    badgeClassName:
      "rounded-md bg-warning-100 px-1.5 py-1 text-xs font-semibold text-warning-900 dark:bg-warning-100-night dark:text-warning-900-night",
  },
  ended: {
    badgeLabel: "ENDED",
    badgeClassName:
      "rounded-md bg-red-100 px-1.5 py-1 text-xs font-semibold text-red-900 dark:bg-red-100-night dark:text-red-900-night",
  },
};

interface NextInvoiceOverviewProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

function formatBillingPeriod(period: string): string {
  return period.charAt(0).toUpperCase() + period.slice(1);
}

export function NextInvoiceOverview({
  owner,
  subscription,
}: NextInvoiceOverviewProps) {
  const router = useAppRouter();
  const [showCancelDialog, setShowCancelDialog] = useState(false);

  const { invoice, isMetronomeInvoiceLoading } = useMetronomeInvoice({
    workspaceId: owner.sId,
    disabled: !subscription.metronomeContractId,
  });
  const { cancelMetronomeContract, isCancellingMetronomeContract } =
    useCancelMetronomeContract({ workspaceId: owner.sId });
  const { reactivateMetronomeContract, isReactivatingMetronomeContract } =
    useReactivateMetronomeContract({ workspaceId: owner.sId });

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

  type SubscriptionStatus = "active" | "cancelled" | "ended";
  const [subscriptionStatus] = useState<SubscriptionStatus>(() =>
    isCancellationScheduled && subscriptionEndsAtMs !== null
      ? subscriptionEndsAtMs <= Date.now()
        ? "ended"
        : "cancelled"
      : "active"
  );
  const canReactivateSubscription =
    isCancellablePlan && subscriptionStatus === "cancelled";

  const periodLabel: Record<SubscriptionStatus, string | null> = {
    active: invoice
      ? `${formatBillingPeriod(invoice.billingPeriod)} - Next billing date: ${periodEndLabel}`
      : null,
    cancelled: subscriptionEndLabel
      ? `Your subscription ends on ${subscriptionEndLabel}. Until then, everything works as normal. Resume anytime before that date to keep your plan with no interruption.`
      : null,
    ended: subscriptionEndLabel
      ? `Your subscription ended on ${subscriptionEndLabel}.`
      : null,
  };

  if (isMetronomeInvoiceLoading) {
    return (
      <div className="w-full p-6">
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

      <div className="flex flex-col gap-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold text-foreground dark:text-foreground-night">
                Next Bill preview
              </span>
              <span className={STATUS_BADGE[subscriptionStatus].badgeClassName}>
                {STATUS_BADGE[subscriptionStatus].badgeLabel}
              </span>
            </div>
            <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
              A preview of what your invoice will look like based on your recent
              usage.
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
          <div className="flex flex-col gap-1">
            <div className="text-4xl text-foreground dark:text-foreground-night">
              {formatAmount(invoice.estimatedAmountCents, invoice.currency)}
            </div>
            <div className="text-xs text-faint dark:text-faint-night">
              {periodLabel[subscriptionStatus]}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            No billing information available for this period yet.
          </div>
        )}
      </div>
    </>
  );
}
