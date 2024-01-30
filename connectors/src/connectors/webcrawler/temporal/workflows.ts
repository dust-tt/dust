import type { ModelId } from "@dust-tt/types";
import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/webcrawler/temporal/activities";
import { REQUEST_HANDLING_TIMEOUT } from "@connectors/connectors/webcrawler/temporal/activities";

const { crawlWebsiteByConnectorId } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minutes",
  // for each page crawl, there are heartbeats, but a page crawl can last at max
  // REQUEST_HANDLING_TIMEOUT seconds
  heartbeatTimeout: `${REQUEST_HANDLING_TIMEOUT} seconds`,
});

export async function crawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<void> {
  await crawlWebsiteByConnectorId(connectorId);
}

export function crawlWebsiteWorkflowId(connectorId: ModelId) {
  return `webcrawler-${connectorId}`;
}
