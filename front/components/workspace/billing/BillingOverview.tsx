import { getPriceAsString } from "@app/lib/client/subscription";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import {
  Calendar,
  ClockRewind,
  Icon,
  Spinner,
  Upload01,
} from "@dust-tt/sparkle";
import { SubscriptionActionButtons } from "./SubscriptionActionButtons";
import { useSubscriptionContext } from "./SubscriptionContext";
import { SubscriptionStatusChip } from "./SubscriptionStatusChip";

function formatBillingPeriod(period: string): string {
  return period.charAt(0).toUpperCase() + period.slice(1);
}

export function BillingOverview() {
  const {
    subscription,
    invoice,
    isMetronomeInvoiceLoading,
    isCancellationScheduled,
    subscriptionEndLabel,
  } = useSubscriptionContext();

  if (isMetronomeInvoiceLoading) {
    return (
      <div className="w-full rounded-lg bg-muted-background p-6 dark:bg-muted-background-night">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-base font-semibold text-foreground dark:text-foreground-night">
            {subscription.plan.name}
          </div>
          <SubscriptionStatusChip />
        </div>
        <SubscriptionActionButtons />
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
            <span>Frequency: {formatBillingPeriod(invoice.billingPeriod)}</span>
          </div>{" "}
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
  );
}
