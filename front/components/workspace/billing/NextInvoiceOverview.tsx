import { Spinner } from "@dust-tt/sparkle";
import { Trans, useLingui } from "@lingui/react/macro";
import { formatAmount } from "./seatTypeUtils";
import { SubscriptionActionButtons } from "./SubscriptionActionButtons";
import { useSubscriptionContext } from "./SubscriptionContext";
import type { SubscriptionStatus } from "./SubscriptionStatusChip";
import { SubscriptionStatusChip } from "./SubscriptionStatusChip";

export function NextInvoiceOverview() {
  const { t } = useLingui();
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
      ? invoice.billingPeriod === "yearly"
        ? t`Yearly - Next billing date: ${periodEndLabel}`
        : t`Monthly - Next billing date: ${periodEndLabel}`
      : null,
    cancelled: subscriptionEndLabel
      ? t`Your subscription ends on ${subscriptionEndLabel}. Until then, everything works as normal. Resume anytime before that date to keep your plan with no interruption.`
      : null,
    ended: subscriptionEndLabel
      ? t`Your subscription ended on ${subscriptionEndLabel}.`
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
            <span className="text-lg font-semibold text-foreground">
              <Trans>Next bill preview</Trans>
            </span>
            <SubscriptionStatusChip />
          </div>
          <div className="text-sm text-muted-foreground">
            <Trans>
              A preview of what your invoice will look like based on your recent
              usage.
            </Trans>
          </div>
        </div>
        <SubscriptionActionButtons />
      </div>

      {invoice ? (
        <div className="flex flex-col gap-1">
          <div className="text-4xl text-foreground">
            {formatAmount(invoice.estimatedAmountCents, invoice.currency)}
          </div>
          <div className="text-xs text-faint">
            {periodLabel[subscriptionStatus]}
          </div>
        </div>
      ) : (
        <div className="text-sm text-muted-foreground">
          <Trans>No billing information available for this period yet.</Trans>
        </div>
      )}
    </div>
  );
}
