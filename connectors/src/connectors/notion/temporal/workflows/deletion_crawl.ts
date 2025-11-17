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

  const pushIfNotSeen = (signal: NotionDeletionCrawlSignal) => {
    if (!seen.has(signal.resourceId)) {
      resourceQueue.push(signal);
      seen.add(signal.resourceId);
    }
  };

  setHandler(notionDeletionCrawlSignal, (signal: NotionDeletionCrawlSignal) => {
    pushIfNotSeen(signal);
  });

  for (;;) {
    // Wait for a resource signal, but stop the workflow if no signals arrive for 5 minutes
    if (!(await condition(() => resourceQueue.length > 0, "5 minutes"))) {
      return;
    }

    while (resourceQueue.length > 0) {
      const resource = resourceQueue.shift();
      if (!resource) {
        continue;
      }

      // check only direct children + parent
      const discovered = await checkResourceAndQueueRelated({
        connectorId,
        resourceId: resource.resourceId,
        resourceType: resource.resourceType,
        workflowId: topLevelWorkflowId,
      });

      for (const pageId of discovered.pageIds) {
        pushIfNotSeen({ resourceId: pageId, resourceType: "page" });
      }

      for (const databaseId of discovered.databaseIds) {
        pushIfNotSeen({ resourceId: databaseId, resourceType: "database" });
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
    seen.clear();

    await batchDeleteResources({
      connectorId,
      workflowId: topLevelWorkflowId,
    });
  }
}
