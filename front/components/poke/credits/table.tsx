import { Tooltip } from "@dust-tt/sparkle";
import type Stripe from "stripe";

import { makeColumnsForCredits } from "@app/components/poke/credits/columns";
import { PokeProgrammaticCostChart } from "@app/components/poke/credits/PokeProgrammaticCostChart";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeCreditType } from "@app/pages/api/poke/workspaces/[wId]/credits";
import type { PokeCreditsData } from "@app/poke/swr/credits";
import { usePokeCredits } from "@app/poke/swr/credits";
import type { SubscriptionType, WorkspaceType } from "@app/types";

const ONE_DOLLAR_MICRO_USD = 1_000_000;

interface CreditsDataTableProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  stripeSubscription: Stripe.Subscription | null;
  loadOnInit?: boolean;
}

function sortByStartDateDescending(
  credits: PokeCreditType[]
): PokeCreditType[] {
  return [...credits].sort((a, b) => {
    // Null start dates go first (pending credits)
    if (!a.startDate && !b.startDate) {
      return 0;
    }
    if (!a.startDate) {
      return -1;
    }
    if (!b.startDate) {
      return 1;
    }
    // Most recent first (descending order)
    return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
  });
}

function formatMicroUsdToUsd(microUsd: number): string {
  return (microUsd / 1_000_000).toFixed(2);
}

export function CreditsDataTable({
  owner,
  subscription,
  stripeSubscription,
  loadOnInit,
}: CreditsDataTableProps) {
  // Get the billing cycle start day from Stripe subscription, fallback to Dust subscription
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
    <>
      <PokeDataTableConditionalFetch<PokeCreditsData, PokeCreditsData>
        header="Credits"
        owner={owner}
        loadOnInit={loadOnInit}
        useSWRHook={usePokeCredits}
      >
        {(data) => (
          <div className="space-y-4">
            {data.excessCreditsLast30DaysMicroUsd > ONE_DOLLAR_MICRO_USD && (
              <div className="rounded-md border border-warning-200 bg-warning-50 p-3 dark:border-warning-200-night dark:bg-warning-50-night">
                <Tooltip
                  label="Excess credits are created when programmatic usage exceeds available credits. This tracks over-consumption that needs to be billed."
                  trigger={
                    <p className="cursor-help text-sm font-medium text-warning-800 dark:text-warning-800-night">
                      Excess credits (last 30 days): $
                      {formatMicroUsdToUsd(
                        data.excessCreditsLast30DaysMicroUsd
                      )}
                    </p>
                  }
                />
              </div>
            )}
            <PokeDataTable
              columns={makeColumnsForCredits()}
              data={sortByStartDateDescending(data.credits)}
              defaultFilterColumn="type"
            />
          </div>
        )}
      </PokeDataTableConditionalFetch>

      {billingCycleStartDay && (
        <PokeProgrammaticCostChart
          owner={owner}
          billingCycleStartDay={billingCycleStartDay}
        />
      )}
    </>
  );
}
