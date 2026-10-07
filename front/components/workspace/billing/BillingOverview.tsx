import type { BillingPeriod } from "@app/types/plan";
import {
  Calendar,
  ClockRewind,
  Icon,
  Spinner,
  Upload01,
} from "@dust-tt/sparkle";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatAmount } from "./seatTypeUtils";
import { SubscriptionActionButtons } from "./SubscriptionActionButtons";
import { useSubscriptionContext } from "./SubscriptionContext";
import { SubscriptionStatusChip } from "./SubscriptionStatusChip";

const FREQUENCY_LABELS: Record<BillingPeriod, MessageDescriptor> = {
  monthly: msg`Frequency: Monthly`,
  yearly: msg`Frequency: Yearly`,
};

export function BillingOverview() {
  const { t } = useLingui();
  const {
    subscription,
    invoice,
    isMetronomeInvoiceLoading,
    isCancellationScheduled,
    periodEndLabel,
    subscriptionEndLabel,
  } = useSubscriptionContext();

  if (isMetronomeInvoiceLoading) {
    return (
      <div className="w-full rounded-lg bg-muted-background p-6">
        <Spinner />
      </div>
    );
  }

  const amount = invoice
    ? formatAmount(invoice.estimatedAmountCents, invoice.currency)
    : null;

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted-background p-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2">
          <div className="truncate text-base font-semibold text-foreground">
            {subscription.plan.name}
          </div>
          <SubscriptionStatusChip />
        </div>
        <SubscriptionActionButtons />
      </div>

      {invoice ? (
        <div className="flex flex-col gap-2 text-xs text-muted-foreground">
          {subscriptionEndLabel && (
            <div className="flex items-center gap-2 font-semibold text-foreground">
              <Icon visual={Calendar} size="xs" />
              <span>
                <Trans>Subscription end: {subscriptionEndLabel}</Trans>
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Icon visual={ClockRewind} size="xs" />
            <span>{t(FREQUENCY_LABELS[invoice.billingPeriod])}</span>
          </div>{" "}
          {!isCancellationScheduled && (
            <div className="flex items-center gap-2">
              <Icon visual={Calendar} size="xs" />
              <span>
                <Trans>Next billing date: {periodEndLabel}</Trans>
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Icon visual={Upload01} size="xs" />
            <span>
              <Trans>Amount: {amount}</Trans>
            </span>
          </div>
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">
          <Trans>No billing information available for this period yet.</Trans>
        </div>
      )}
    </div>
  );
}
