import type { ModelId } from "@dust-tt/types";
import { CancellationScope, proxyActivities } from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/webcrawler/temporal/activities";

// timeout for crawling a single url = timeout for upserting (5 minutes) + 2mn
// leeway to crawl on slow websites
export const REQUEST_HANDLING_TIMEOUT = 420;

const { crawlWebsiteByConnectorId } = proxyActivities<typeof activities>({
  startToCloseTimeout: "120 minutes",
  // for each page crawl, there are heartbeats, but a page crawl can last at max
  // REQUEST_HANDLING_TIMEOUT seconds
  heartbeatTimeout: `${REQUEST_HANDLING_TIMEOUT} seconds`,
});

export async function crawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<void> {
  await CancellationScope.cancellable(
    crawlWebsiteByConnectorId.bind(null, connectorId)
  );
}

export function crawlWebsiteWorkflowId(connectorId: ModelId) {
  return `webcrawler-${connectorId}`;
}
