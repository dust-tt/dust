import type { SubscriptionType, WorkspaceType } from "@dust-tt/types";

import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";
import { makeColumnsForSubscriptions } from "@app/components/poke/subscriptions/columns";

interface SubscriptionsDataTableProps {
  owner: WorkspaceType;
  subscriptions: SubscriptionType[];
}

function prepareSubscriptionsForDisplay(
  owner: WorkspaceType,
  subscriptions: SubscriptionType[]
) {
  return subscriptions.map((s) => {
    return {
      sId: s.sId ?? "unknown",
      planCode: s.plan.code,
      status: s.status,
      startDate: s.startDate
        ? new Date(s.startDate).toLocaleDateString()
        : null,
      endDate: s.endDate ? new Date(s.endDate).toLocaleDateString() : null,
    };
  });
}

export function SubscriptionsDataTable({
  owner,
  subscriptions,
}: SubscriptionsDataTableProps) {
  return (
    <div className="border-material-200 my-4 flex flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">Subscriptions:</h2>
      <PokeDataTable
        columns={makeColumnsForSubscriptions()}
        data={prepareSubscriptionsForDisplay(owner, subscriptions)}
      />
    </div>
  );
}
