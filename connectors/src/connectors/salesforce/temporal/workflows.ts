import { proxyActivities, setHandler } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/salesforce/temporal/activities";
import { resyncSignal } from "@connectors/connectors/salesforce/temporal/signals";
import type * as sync_status from "@connectors/lib/sync_status";
import type { ModelId } from "@connectors/types";

const { syncSucceeded, syncStarted } = proxyActivities<typeof sync_status>({
  startToCloseTimeout: "10 minutes",
});

const {
  syncSalesforceConnection,
  discoverSalesforceSyncedQueries,
  syncSalesforceQueryPage,
} = proxyActivities<typeof activities>({
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
    await syncStarted(connectorId);
    await syncSalesforceConnection(connectorId);

    // Synced queries
    const queries = await discoverSalesforceSyncedQueries(connectorId);
    for (const q of queries) {
      await syncSalesforceQueryPage(connectorId, {
        queryId: q.id,
        offset: 0,
        limit: 1000, // Adjust as needed
        lastSeenModifiedDate: q.lastSeenModifiedDate,
      });
    }

    await syncSucceeded(connectorId);
  } while (signaled);
}
