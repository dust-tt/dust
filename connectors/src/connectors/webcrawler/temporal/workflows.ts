import {
  ActivityCancellationType,
  CancellationScope,
  ParentClosePolicy,
  proxyActivities,
  startChild,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/webcrawler/temporal/activities";
import type { ModelId } from "@connectors/types";

// timeout for crawling a single url = timeout for upserting (5 minutes) + 2mn
// leeway to crawl on slow websites
export const REQUEST_HANDLING_TIMEOUT = 420;
// For each page crawl we have an heartbeat but some crawls seem to stall for longer periods. Giving
// them 30mn to hearbeat.
export const HEARTBEAT_TIMEOUT = 1800;

export const MAX_TIME_TO_CRAWL_MINUTES = 240;
export const MIN_EXTRACTED_TEXT_LENGTH = 1024;
export const MAX_BLOCKED_RATIO = 0.9;
export const MAX_PAGES_TOO_LARGE_RATIO = 0.9;

const { crawlWebsiteByConnectorId, webCrawlerGarbageCollector } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: `${MAX_TIME_TO_CRAWL_MINUTES} minutes`,
    heartbeatTimeout: `${HEARTBEAT_TIMEOUT} seconds`,
    cancellationType: ActivityCancellationType.TRY_CANCEL,
    retry: {
      initialInterval: `${REQUEST_HANDLING_TIMEOUT * 2} seconds`,
      maximumInterval: "3600 seconds",
    },
  });

const { getConnectorIdsForWebsitesToCrawl, markAsCrawled } = proxyActivities<
  typeof activities
>({
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
  const connectorIds = await getConnectorIdsForWebsitesToCrawl();

  for (const connectorId of connectorIds) {
    // We mark the website as crawled before starting the workflow to avoid
    // starting the same workflow in the next run of the scheduler.
    await markAsCrawled(connectorId);
    // Start a workflow to crawl the website but don't wait for it to complete.
    await startChild(crawlWebsiteWorkflow, {
      workflowId: crawlWebsiteWorkflowId(connectorId),
      searchAttributes: {
        connectorId: [connectorId],
      },
      args: [connectorId],
      parentClosePolicy: ParentClosePolicy.PARENT_CLOSE_POLICY_ABANDON,
      memo: workflowInfo().memo,
    });
  }
}

export function crawlWebsiteSchedulerWorkflowId() {
  return `webcrawler-scheduler`;
}
