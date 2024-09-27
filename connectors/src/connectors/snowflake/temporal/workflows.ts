import type { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/snowflake/temporal/activities";

const { syncSnowflakeConnection } = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minute",
});

export async function snowflakeSyncWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  await syncSnowflakeConnection(connectorId);
}
