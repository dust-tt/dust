import { proxyActivities, setHandler } from "@temporalio/workflow";
import _ from "lodash";

import type * as activities from "@app/temporal/drop_pending_agents/activities";

import { BATCH_SIZE } from "./config";
import { runSignal } from "./signals";

const { getPendingAgentsOlderThanActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "5 minutes",
  }
);

const { destroyPendingAgentsBatchActivity } = proxyActivities<typeof activities>(
  {
    startToCloseTimeout: "10 minutes",
    heartbeatTimeout: "2 minutes",
  }
);

export async function dropPendingAgentsWorkflow(): Promise<void> {
  setHandler(runSignal, () => {
    // Empty handler - just receiving the signal will trigger a workflow execution.
  });

  // Get all pending agents older than 30 days.
  const pendingAgentIds = await getPendingAgentsOlderThanActivity(30);

  // Process sequentially in configurable batches (default: 10).
  const chunks = _.chunk(pendingAgentIds, BATCH_SIZE);
  for (const chunk of chunks) {
    await destroyPendingAgentsBatchActivity({ agentIds: chunk });
  }
}
