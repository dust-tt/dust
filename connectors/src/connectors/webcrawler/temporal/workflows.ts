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

import { WEBCRAWLER_MAX_PAGES } from "../../../types/webcrawler";

// timeout for crawling a single url = timeout for upserting (5 minutes) + 2mn
// leeway to crawl on slow websites
export const REQUEST_HANDLING_TIMEOUT = 420;
// For each page crawl we have an heartbeat but some crawls seem to stall for longer periods. Giving
// them 20mn to hearbeat.
export const HEARTBEAT_TIMEOUT = 1200;

export const FIRECRAWL_REQ_TIMEOUT = 30_000; // millisecond
export const MAX_TIME_TO_CRAWL_MINUTES =
  (WEBCRAWLER_MAX_PAGES * FIRECRAWL_REQ_TIMEOUT) / 1000 / 60; // X millisecond timeout per page, and we have a hardcoded limit of Y pages
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

const {
  getConnectorIdsForWebsitesToCrawl,
  markAsCrawled,
  firecrawlCrawlFailed,
  firecrawlCrawlStarted,
  firecrawlCrawlCompleted,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
});

const { firecrawlCrawlPage } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

export async function crawlWebsiteWorkflow(
  connectorId: ModelId
): Promise<void> {
  const res = await CancellationScope.cancellable(
    crawlWebsiteByConnectorId.bind(null, connectorId)
  );

  if (res?.launchGarbageCollect) {
    await webCrawlerGarbageCollector(connectorId, res?.startedAtTs);
  }
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
      parentClosePolicy: ParentClosePolicy.ABANDON,
      memo: workflowInfo().memo,
    });
  }
}

export function crawlWebsiteSchedulerWorkflowId() {
  return `webcrawler-scheduler`;
}

export async function garbageCollectWebsiteWorkflow(
  connectorId: ModelId,
  lastSyncStartTs: number
): Promise<void> {
  await webCrawlerGarbageCollector(connectorId, lastSyncStartTs);
}

export function garbageCollectWebsiteWorkflowId(
  connectorId: ModelId,
  lastSyncStartTs: number
): string {
  return `webcrawler-${connectorId}-garbage-collector-${lastSyncStartTs}`;
}

// Firecrawl crawl specific workflows

export function firecrawlCrawlFailedWorkflowId(
  connectorId: ModelId,
  crawlId: string
) {
  return `webcrawler-${connectorId}-firecrawl-crawl-${crawlId}-failed`;
}

export async function firecrawlCrawlFailedWorkflow(
  connectorId: ModelId,
  crawlId: string
) {
  await firecrawlCrawlFailed(connectorId, crawlId);
}

export function firecrawlCrawlStartedWorkflowId(
  connectorId: ModelId,
  crawlId: string
) {
  return `webcrawler-${connectorId}-firecrawl-crawl-${crawlId}-started`;
}

export async function firecrawlCrawlStartedWorkflow(
  connectorId: ModelId,
  crawlId: string
) {
  await firecrawlCrawlStarted(connectorId, crawlId);
}

export function firecrawlCrawlCompletedWorkflowId(
  connectorId: ModelId,
  crawlId: string
) {
  return `webcrawler-${connectorId}-firecrawl-crawl-${crawlId}-completed`;
}

export async function firecrawlCrawlCompletedWorkflow(
  connectorId: ModelId,
  crawlId: string
) {
  const res = await firecrawlCrawlCompleted(connectorId, crawlId);

  // If we have a lastSyncStartTs, we start the garbage collector workflow.
  if (res?.lastSyncStartTs) {
    // sleep for 120s
    await new Promise((resolve) => setTimeout(resolve, 120_000));

    await startChild(garbageCollectWebsiteWorkflow, {
      workflowId: garbageCollectWebsiteWorkflowId(
        connectorId,
        res.lastSyncStartTs
      ),
      searchAttributes: {
        connectorId: [connectorId],
      },
      args: [connectorId, res.lastSyncStartTs],
      parentClosePolicy: ParentClosePolicy.ABANDON,
      memo: workflowInfo().memo,
    });
  }
}

export function firecrawlCrawlPageWorkflowId(
  connectorId: ModelId,
  crawlId: string,
  scrapeId: string
) {
  return `webcrawler-${connectorId}-firecrawl-crawl-${crawlId}-page-${scrapeId}`;
}

export async function firecrawlCrawlPageWorkflow(
  connectorId: ModelId,
  crawlId: string,
  scrapeId: string
) {
  await firecrawlCrawlPage(connectorId, crawlId, scrapeId);
}
