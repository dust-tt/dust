import { proxyActivities, setHandler } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/databricks/temporal/activities";
import { resyncSignal } from "@connectors/connectors/databricks/temporal/signals";
import type { ModelId } from "@connectors/types";

const { syncDatabricksConnection } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function databricksSyncWorkflow({
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
    await syncDatabricksConnection(connectorId);
  } while (signaled);
}

