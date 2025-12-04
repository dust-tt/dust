import { makeColumnsForCredits } from "@app/components/poke/credits/columns";
import { PokeProgrammaticCostChart } from "@app/components/poke/credits/PokeProgrammaticCostChart";
import { PokeDataTableConditionalFetch } from "@app/components/poke/PokeConditionalDataTables";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import type { PokeCreditType } from "@app/pages/api/poke/workspaces/[wId]/credits";
import { usePokeCredits } from "@app/poke/swr/credits";
import type { SubscriptionType, WorkspaceType } from "@app/types";

interface CreditsDataTableProps {
  owner: WorkspaceType;
  subscription: SubscriptionType;
  loadOnInit?: boolean;
}

function sortByExpirationDate(credits: PokeCreditType[]): PokeCreditType[] {
  return [...credits].sort((a, b) => {
    // Null expiration dates go last
    if (!a.expirationDate && !b.expirationDate) {
      return 0;
    }
    if (!a.expirationDate) {
      return 1;
    }
    if (!b.expirationDate) {
      return -1;
    }
    return (
      new Date(a.expirationDate).getTime() -
      new Date(b.expirationDate).getTime()
    );
  });
}

export function CreditsDataTable({
  owner,
  subscription,
  loadOnInit,
}: CreditsDataTableProps) {
  // Get the billing cycle start day from the subscription start date
  const billingCycleStartDay = subscription.startDate
    ? new Date(subscription.startDate).getDate()
    : null;

  return (
    <>
      <PokeDataTableConditionalFetch
        header="Credits"
        owner={owner}
        loadOnInit={loadOnInit}
        useSWRHook={usePokeCredits}
      >
        {(data) => (
          <PokeDataTable
            columns={makeColumnsForCredits()}
            data={sortByExpirationDate(data)}
            defaultFilterColumn="type"
          />
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
