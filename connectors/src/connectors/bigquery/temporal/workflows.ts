import type { ModelId } from "@dust-tt/types";
import { proxyActivities, setHandler } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/bigquery/temporal/activities";
import { resyncSignal } from "@connectors/connectors/bigquery/temporal/signals";

const { syncBigQueryConnection } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

export async function bigquerySyncWorkflow({
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
    await syncBigQueryConnection(connectorId);
  } while (signaled);
}
