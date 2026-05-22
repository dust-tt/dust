import { getPriceAsString } from "@app/lib/client/subscription";
import { useMetronomeInvoice } from "@app/lib/swr/workspaces";
import type { SubscriptionType } from "@app/types/plan";
import type { LightWorkspaceType } from "@app/types/user";
import {
  ActionCalendarIcon,
  ArrowUpOnSquareIcon,
  HistoryIcon,
  Icon,
  Spinner,
} from "@dust-tt/sparkle";

interface BillingOverviewProps {
  owner: LightWorkspaceType;
  subscription: SubscriptionType;
}

function formatBillingPeriod(period: string): string {
  return period.charAt(0).toUpperCase() + period.slice(1);
}

function formatDate(msEpoch: number): string {
  return new Date(msEpoch).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function BillingOverview({
  owner,
  subscription,
}: BillingOverviewProps) {
  const { invoice, isMetronomeInvoiceLoading } = useMetronomeInvoice({
    workspaceId: owner.sId,
    disabled: !subscription.metronomeContractId,
  });

  if (isMetronomeInvoiceLoading) {
    return (
      <div className="w-full rounded-lg bg-muted-background p-6 dark:bg-muted-background-night">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted-background p-4 dark:bg-muted-background-night">
      <div className="flex items-center gap-2">
        <div className="truncate text-base font-semibold text-foreground dark:text-foreground-night">
          {subscription.plan.name}
        </div>
        <div className="rounded-md bg-gray-100 px-2 py-1 text-xs text-gray-900 dark:bg-gray-100-night dark:text-gray-900-night">
          Current
        </div>
      </div>

      {invoice ? (
        <div className="flex flex-col gap-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
          <div className="flex items-center gap-2">
            <Icon visual={HistoryIcon} size="xs" />
            <span>Frequency: {formatBillingPeriod(invoice.billingPeriod)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Icon visual={ActionCalendarIcon} size="xs" />
            <span>
              Next billing date: {formatDate(invoice.currentPeriodEndMs)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Icon visual={ArrowUpOnSquareIcon} size="xs" />
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
