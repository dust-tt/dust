import { Spinner } from "@dust-tt/sparkle";
import { SubscriptionActionButtons } from "./SubscriptionActionButtons";
import { useSubscriptionContext } from "./SubscriptionContext";
import type { SubscriptionStatus } from "./SubscriptionStatusChip";
import { SubscriptionStatusChip } from "./SubscriptionStatusChip";
import { formatAmount } from "./seatTypeUtils";

function formatBillingPeriod(period: string): string {
  return period.charAt(0).toUpperCase() + period.slice(1);
}

export function NextInvoiceOverview() {
  const {
    invoice,
    isMetronomeInvoiceLoading,
    subscriptionStatus,
    periodEndLabel,
    subscriptionEndLabel,
  } = useSubscriptionContext();

  const periodLabel: Record<SubscriptionStatus, string | null> = {
    free: null,
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
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-foreground dark:text-foreground-night">
              Next Bill preview
            </span>
            <SubscriptionStatusChip />
          </div>
          <div className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            A preview of what your invoice will look like based on your recent
            usage.
          </div>
        </div>
        <SubscriptionActionButtons />
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
  );
}
