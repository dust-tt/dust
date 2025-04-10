import { proxyActivities, setHandler } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/salesforce/temporal/activities";
import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";
import type { ModelId } from "@connectors/types";

const { syncSalesforceConnection } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

export async function salesforceSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  let signaled = false;

  setHandler(resyncSignal, () => {
    signaled = true;
  });

  do {
    signaled = false;
    await syncSalesforceConnection(connectorId);
  } while (signaled);
}
