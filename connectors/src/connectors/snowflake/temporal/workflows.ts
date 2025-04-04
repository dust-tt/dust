import { proxyActivities, setHandler } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/snowflake/temporal/activities";
import { resyncSignal } from "@connectors/connectors/snowflake/temporal/signals";
import type { ModelId } from "@connectors/types";

const { syncSnowflakeConnection } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

export async function snowflakeSyncWorkflow({
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
    await syncSnowflakeConnection(connectorId);
  } while (signaled);
}
