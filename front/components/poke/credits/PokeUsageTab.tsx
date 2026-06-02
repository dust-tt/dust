import { PokeAwuUsageChart } from "@app/components/poke/credits/PokeAwuUsageChart";
import type { PokeStripeSubscriptionWire } from "@app/lib/api/poke/workspace_info";
import { usePokeAwuPoolSummary } from "@app/poke/swr/credits";
import type { SubscriptionType } from "@app/types/plan";
import type { WorkspaceType } from "@app/types/user";
import {
  ContentMessage,
  ExclamationCircleIcon,
  Spinner,
} from "@dust-tt/sparkle";

interface PokeUsageTabProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  stripeSubscription: PokeStripeSubscriptionWire | null;
}

function formatCredits(credits: number): string {
  return Math.round(credits).toLocaleString("en-US");
}

interface PokeCreditPoolCardProps {
  owner: WorkspaceType;
}

function PokeCreditPoolCard({ owner }: PokeCreditPoolCardProps) {
  const { awuPoolSummary, isAwuPoolSummaryLoading, isAwuPoolSummaryError } =
    usePokeAwuPoolSummary({ owner });

  if (isAwuPoolSummaryLoading) {
    return (
      <div className="flex justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (isAwuPoolSummaryError || !awuPoolSummary) {
    return (
      <ContentMessage
        title="Failed to load Workspace Credits Pool"
        icon={ExclamationCircleIcon}
        variant="warning"
      >
        Could not load the credit pool summary for this workspace.
      </ContentMessage>
    );
  }

  const {
    totalActiveCredits,
    totalRemainingCredits,
    resetDate,
    overageCredits,
  } = awuPoolSummary;
  const consumed = Math.max(0, totalActiveCredits - totalRemainingCredits);
  const consumedPct =
    totalActiveCredits > 0
      ? Math.min((consumed / totalActiveCredits) * 100, 100)
      : 0;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-4 dark:border-border-night">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-foreground dark:text-foreground-night">
          Workspace Credits Pool
        </span>
        <span className="text-sm font-semibold text-foreground dark:text-foreground-night">
          {formatCredits(consumed)} / {formatCredits(totalActiveCredits)}{" "}
          credits
        </span>
      </div>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted-foreground/10 dark:bg-muted-foreground-night/10">
        <div
          className="h-full shrink-0 bg-highlight transition-all dark:bg-highlight-night"
          style={{ width: `${consumedPct}%` }}
        />
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground dark:text-muted-foreground-night">
        <span>{formatCredits(totalRemainingCredits)} credits remaining</span>
        {overageCredits !== null && overageCredits > 0 && (
          <span>{formatCredits(overageCredits)} overage credits</span>
        )}
        {resetDate && (
          <span>
            Resets{" "}
            {new Date(resetDate).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            })}
          </span>
        )}
      </div>
    </div>
  );
}

export function PokeUsageTab({
  owner,
  subscription,
  stripeSubscription,
}: PokeUsageTabProps) {
  // Billing cycle start day from Stripe subscription, fallback to Dust
  // subscription (mirrors CreditsDataTable).
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

  return (
    <div className="flex flex-col gap-4">
      <PokeCreditPoolCard owner={owner} />
      {billingCycleStartDay && (
        <PokeAwuUsageChart
          owner={owner}
          billingCycleStartDay={billingCycleStartDay}
        />
      )}
    </div>
  );
}
