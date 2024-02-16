import type { ModelId } from "@dust-tt/types";
import {
  ActivityCancellationType,
  CancellationScope,
  executeChild,
  proxyActivities,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/webcrawler/temporal/activities";

// timeout for crawling a single url = timeout for upserting (5 minutes) + 2mn
// leeway to crawl on slow websites
export const REQUEST_HANDLING_TIMEOUT = 420;

const { crawlWebsiteByConnectorId, webCrawlerGarbageCollector } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "120 minutes",
    // for each page crawl, there are heartbeats, but a page crawl can last at max
    // REQUEST_HANDLING_TIMEOUT seconds
    heartbeatTimeout: `${REQUEST_HANDLING_TIMEOUT} seconds`,
    cancellationType: ActivityCancellationType.TRY_CANCEL,
    retry: {
      initialInterval: `${REQUEST_HANDLING_TIMEOUT * 2} seconds`,
      maximumInterval: "3600 seconds",
    },
  });

const { getWebsitesToCrawl } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

export async function crawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<void> {
  const startedAtTs = Date.now();
  await CancellationScope.cancellable(
    crawlWebsiteByConnectorId.bind(null, connectorId)
  );
  await webCrawlerGarbageCollector(connectorId, startedAtTs);
}

export function crawlWebsiteWorkflowId(connectorId: ModelId) {
  return `webcrawler-${connectorId}`;
}

export async function crawlWebsiteSchedulerWorkflow() {
  const connectorIds = await getWebsitesToCrawl();

  for (const connectorId of connectorIds) {
    await executeChild(crawlWebsiteWorkflow, {
      workflowId: crawlWebsiteWorkflowId(connectorId),
      searchAttributes: {
        connectorId: [connectorId],
      },
      args: [connectorId],
      memo: workflowInfo().memo,
    });
  }
}

export function crawlWebsiteSchedulerWorkflowId() {
  return `webcrawler-scheduler`;
}
