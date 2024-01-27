import type { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/webcrawler/temporal/activities";

const { crawlWebsiteByConnectorId } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minutes",
  heartbeatTimeout: "600 seconds",
});

export async function crawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<void> {
  await crawlWebsiteByConnectorId(connectorId);
}

export function crawlWebsiteWorkflowId(connectorId: ModelId) {
  return `webcrawler-${connectorId}`;
}
