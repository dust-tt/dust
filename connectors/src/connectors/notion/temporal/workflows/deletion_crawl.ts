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
  batchDeleteResources,
  clearWorkflowCache,
  deletionCrawlAddSignalsToRedis,
  batchDiscoverDeletions,
  completeDeletionCrawlRun,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minute",
});

const DISCOVERY_BATCH_SIZE = 50;

/**
 * Signal-based deletion crawl workflow.
 * Receives signals for resources to check, maintains a "seen" cache in Redis to avoid duplicates,
 * and recursively checks parent/children relationships.
 * Auto-terminates after 5 minutes of inactivity.
 */
export async function notionDeletionCrawlWorkflow({
  connectorId,
}: {
  connectorId: ModelId;
}) {
  const topLevelWorkflowId = workflowInfo().workflowId;

  // Clear workflow cache (pg) at start
  await clearWorkflowCache({
    connectorId,
    topLevelWorkflowId,
  });

  // Pending signals from signal handler (buffer until we store in redis)
  const pendingSignals: NotionDeletionCrawlSignal[] = [];

  setHandler(notionDeletionCrawlSignal, (signal: NotionDeletionCrawlSignal) => {
    pendingSignals.push(signal);
  });

  for (;;) {
    if (pendingSignals.length > 0) {
      const storedSignals = [...pendingSignals];
      await deletionCrawlAddSignalsToRedis({
        connectorId,
        workflowId: topLevelWorkflowId,
        signals: storedSignals,
      });
      pendingSignals.splice(0, storedSignals.length);
    }

    const { hasMore } = await batchDiscoverDeletions({
      connectorId,
      workflowId: topLevelWorkflowId,
      batchSize: DISCOVERY_BATCH_SIZE,
    });

    await batchDeleteResources({
      connectorId,
      workflowId: topLevelWorkflowId,
    });

    if (workflowInfo().continueAsNewSuggested) {
      await continueAsNew({ connectorId });
      return;
    }

    // Wait for signals to arrive, but stop the workflow if no signals arrive for 5 minutes
    if (
      !hasMore &&
      !(await condition(() => pendingSignals.length > 0, "5 minutes"))
    ) {
      await completeDeletionCrawlRun({
        connectorId,
        workflowId: topLevelWorkflowId,
      });
      return;
    }
  }
}
