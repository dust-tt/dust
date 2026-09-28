import type * as activities from "@app/temporal/data_retention/activities";
import type { ModelId } from "@app/types/shared/model_id";
import { log, proxyActivities, setHandler } from "@temporalio/workflow";
import chunk from "lodash/chunk";
import { runSignal } from "./signals";

const {
  getWorkspacesWithConversationsRetentionActivity,
  getAgentsWithConversationsRetentionActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "5 minutes",
});

const {
  purgeConversationsBatchActivity,
  purgeAgentConversationsBatchActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "30 minutes",
  heartbeatTimeout: "5 minutes",
});

export async function dataRetentionWorkflow(): Promise<void> {
  setHandler(runSignal, () => {
    // Empty handler - just receiving the signal will trigger a workflow execution.
  });

  // First the Workspace level data retention.
  const workspaceIds = await getWorkspacesWithConversationsRetentionActivity();
  const workspaceChunks = chunk(workspaceIds, 4);

  for (const workspaceChunk of workspaceChunks) {
    await purgeConversationsBatchActivity({
      workspaceIds: workspaceChunk,
    });
  }

  // Then the Agent level data retention.
  const agentsWithDataRetention =
    await getAgentsWithConversationsRetentionActivity();

  for (const agentWithDataRetention of agentsWithDataRetention) {
    await purgeAgentConversationsBatchActivity({
      agentConfigurationId: agentWithDataRetention.agentConfigurationId,
      workspaceId: agentWithDataRetention.workspaceId,
      retentionDays: agentWithDataRetention.retentionDays,
    });
  }
}

/**
 * Batches each sweep may process in one workflow run before it stops and leaves the rest to the
 * next run, so a large backlog cannot keep the activity queue busy indefinitely.
 *
 * Declared here rather than in `config.ts`: workflow code is bundled by webpack without the
 * tsconfig path plugin in development, so it must not reach for an `@app/*` module — directly or
 * through one, as `config.ts` does for `ONE_DAY_MS`.
 */
const FRAME_FUNCTION_INVOCATION_MAX_BATCHES_PER_RUN = 500;
const FRAME_PUBLICATION_MAX_BATCHES_PER_RUN = 100;

const {
  purgeExpiredFrameFunctionInvocationsActivity,
  purgeStaleFramePublicationsActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

/**
 * Delete Frame function invocations past the retention window, then the superseded publications
 * the first sweep has just unblocked.
 */
export async function framesRetentionWorkflow(): Promise<void> {
  await purgeExpiredInvocations();
  await purgeStalePublications();
}

/**
 * Delete Frame function invocations past the retention window, oldest first, until the sweep
 * runs out of expired rows or hits its per-run batch limit.
 */
async function purgeExpiredInvocations(): Promise<void> {
  let afterModelId: ModelId | null = null;
  let deletedInvocationCount = 0;
  let deletedMCPActionCount = 0;
  let scannedCount = 0;

  for (
    let processedBatches = 0;
    processedBatches < FRAME_FUNCTION_INVOCATION_MAX_BATCHES_PER_RUN;
    processedBatches += 1
  ) {
    const result: activities.PurgeExpiredFrameFunctionInvocationsActivityResult =
      await purgeExpiredFrameFunctionInvocationsActivity({ afterModelId });
    deletedInvocationCount += result.deletedInvocationCount;
    deletedMCPActionCount += result.deletedMCPActionCount;
    scannedCount += result.scannedCount;

    if (result.nextAfterModelId === null) {
      log.info("[Frames Retention] Invocation sweep complete.", {
        deletedInvocationCount,
        deletedMCPActionCount,
        processedBatches: processedBatches + 1,
        scannedCount,
      });

      return;
    }

    afterModelId = result.nextAfterModelId;
  }

  // Not an error: the next scheduled run resumes from the oldest remaining rows. It does mean the
  // backlog is growing faster than one run drains it, which is worth alerting on.
  log.warn("[Frames Retention] Invocation sweep hit its per-run batch limit.", {
    afterModelId,
    deletedInvocationCount,
    deletedMCPActionCount,
    processedBatches: FRAME_FUNCTION_INVOCATION_MAX_BATCHES_PER_RUN,
    scannedCount,
  });
}

/**
 * Delete every Frame's superseded publications: their function rows and their GCS prefix. Runs
 * after the invocation sweep, which is what frees publications whose functions still had runs on
 * record.
 */
async function purgeStalePublications(): Promise<void> {
  let afterModelId: ModelId | null = null;
  let deletedFunctionCount = 0;
  let deletedPublicationCount = 0;
  let scannedFrameCount = 0;

  for (
    let processedBatches = 0;
    processedBatches < FRAME_PUBLICATION_MAX_BATCHES_PER_RUN;
    processedBatches += 1
  ) {
    const result: activities.PurgeStaleFramePublicationsActivityResult =
      await purgeStaleFramePublicationsActivity({ afterModelId });
    deletedFunctionCount += result.deletedFunctionCount;
    deletedPublicationCount += result.deletedPublicationCount;
    scannedFrameCount += result.scannedFrameCount;

    if (result.nextAfterModelId === null) {
      log.info("[Frames Retention] Publication sweep complete.", {
        deletedFunctionCount,
        deletedPublicationCount,
        processedBatches: processedBatches + 1,
        scannedFrameCount,
      });

      return;
    }

    afterModelId = result.nextAfterModelId;
  }

  // Not an error: the next scheduled run resumes from the Frames this one did not reach.
  log.warn(
    "[Frames Retention] Publication sweep hit its per-run batch limit.",
    {
      afterModelId,
      deletedFunctionCount,
      deletedPublicationCount,
      processedBatches: FRAME_PUBLICATION_MAX_BATCHES_PER_RUN,
      scannedFrameCount,
    }
  );
}
