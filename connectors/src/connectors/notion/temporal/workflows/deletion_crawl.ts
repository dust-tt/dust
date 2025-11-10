import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  workflowInfo,
} from "@temporalio/workflow";

import type * as activities from "@connectors/connectors/notion/temporal/activities";
import type { NotionDeletionCrawlSignal } from "@connectors/connectors/notion/temporal/signals";
import { notionDeletionCrawlSignal } from "@connectors/connectors/notion/temporal/signals";
import type { ModelId } from "@connectors/types";

const {
  checkResourceAndQueueRelated,
  batchDeleteResources,
  clearWorkflowCache,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const DELETE_BATCH_SIZE = 100;

/**
 * Signal-based deletion crawl workflow.
 * Receives signals for resources to check, maintains a "seen" cache to avoid duplicates,
 * and recursively checks parent/children relationships.
 * Auto-terminates after 5 minutes of inactivity.
 */
export async function notionDeletionCrawlWorkflow({
  connectorId,
  resourceQueue = [],
}: {
  connectorId: ModelId;
  resourceQueue?: NotionDeletionCrawlSignal[];
}) {
  const seen = new Set<string>();
  const topLevelWorkflowId = workflowInfo().workflowId;

  // Clear workflow cache at start
  await clearWorkflowCache({
    connectorId,
    topLevelWorkflowId,
  });

  // Helper to create unique key for seen tracking
  const resourceKey = (resourceId: string, resourceType: string) =>
    `${resourceType}:${resourceId}`;

  // Set up signal handler
  setHandler(notionDeletionCrawlSignal, (signal: NotionDeletionCrawlSignal) => {
    const key = resourceKey(signal.resourceId, signal.resourceType);
    // Only add to queue if not already seen
    if (!seen.has(key)) {
      resourceQueue.push(signal);
    }
  });

  for (;;) {
    // Wait for a resource signal, but stop the workflow if no signals arrive for 5 minutes
    if (!(await condition(() => resourceQueue.length > 0, "5 minutes"))) {
      return;
    }

    // Process all queued resources
    while (resourceQueue.length > 0) {
      const resource = resourceQueue.shift();
      if (!resource) {
        continue;
      }

      const key = resourceKey(resource.resourceId, resource.resourceType);

      // Mark as seen before processing (prevents duplicates)
      seen.add(key);

      // Check this resource and get discovered parent/children
      const discovered = await checkResourceAndQueueRelated({
        connectorId,
        resourceId: resource.resourceId,
        resourceType: resource.resourceType,
        workflowId: topLevelWorkflowId,
      });

      // Add discovered resources to queue (signal handler will check seen set)
      for (const pageId of discovered.pageIds) {
        const pageKey = resourceKey(pageId, "page");
        if (!seen.has(pageKey)) {
          resourceQueue.push({ resourceId: pageId, resourceType: "page" });
        }
      }

      for (const databaseId of discovered.databaseIds) {
        const dbKey = resourceKey(databaseId, "database");
        if (!seen.has(dbKey)) {
          resourceQueue.push({
            resourceId: databaseId,
            resourceType: "database",
          });
        }
      }

      if (workflowInfo().continueAsNewSuggested) {
        await batchDeleteResources({
          connectorId,
          workflowId: topLevelWorkflowId,
        });
        await continueAsNew({ connectorId, resourceQueue });
        return;
      } else if (seen.size % DELETE_BATCH_SIZE == 0) {
        await batchDeleteResources({
          connectorId,
          workflowId: topLevelWorkflowId,
        });
      }
    }

    await batchDeleteResources({
      connectorId,
      workflowId: topLevelWorkflowId,
    });
  }
}
