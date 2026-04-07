import { Authenticator } from "@app/lib/auth";
import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ModelId } from "@app/types/shared/model_id";
import { heartbeat } from "@temporalio/activity";

import { BATCH_SIZE, DESTROY_THRESHOLD_MS, SLEEP_THRESHOLD_MS } from "./config";

const REAPER_CONCURRENCY = 16;

/**
 * Batch-fetch workspaces for a list of conversations to avoid N+1 queries.
 * Returns a Map for O(1) lookup during concurrent processing.
 */
async function fetchWorkspaceMap(
  conversations: Array<{ conversationId: string; workspaceModelId: ModelId }>
): Promise<Map<ModelId, WorkspaceResource>> {
  const uniqueWorkspaceModelIds = [
    ...new Set(conversations.map((c) => c.workspaceModelId)),
  ];

  const workspaces = await WorkspaceResource.fetchByModelIds(
    uniqueWorkspaceModelIds
  );

  return new Map(workspaces.map((w) => [w.id, w]));
}

/**
 * Process one batch of stale sandboxes. Returns `true` when either query
 * returned a full batch, signalling the workflow to loop for more.
 */
export async function reapStaleSandboxesActivity(): Promise<boolean> {
  // Phase 1: Sleep running sandboxes that have been idle > SLEEP_THRESHOLD_MS.
  const runningConversations =
    await SandboxResource.dangerouslyGetStaleConversationIds({
      status: "running",
      olderThanMs: SLEEP_THRESHOLD_MS,
      limit: BATCH_SIZE,
    });

  if (runningConversations.length > 0) {
    logger.info(
      { count: runningConversations.length },
      "Reaper: stale running sandboxes found."
    );

    // Batch-fetch all workspaces to avoid N queries inside the concurrent loop
    const workspaceMap = await fetchWorkspaceMap(runningConversations);

    logger.info(
      {
        conversationCount: runningConversations.length,
        uniqueWorkspaceCount: workspaceMap.size,
      },
      "Batch-fetched workspaces for running sandboxes"
    );

    await concurrentExecutor(
      runningConversations,
      async ({ conversationId, workspaceModelId }) => {
        const workspace = workspaceMap.get(workspaceModelId);

        if (!workspace) {
          logger.warn(
            { conversationId, workspaceModelId },
            "Workspace not found, skipping"
          );
          return;
        }

        const auth = await Authenticator.internalBuilderForWorkspace(
          workspace.sId
        );
        const result = await SandboxResource.dangerouslySleepIfRunning(
          auth,
          conversationId
        );
        if (result.isErr()) {
          logger.error(
            { conversationId, error: result.error.message },
            "Reaper: failed to sleep sandbox — continuing."
          );
        }
        heartbeat();
      },
      { concurrency: REAPER_CONCURRENCY }
    );
  }

  // Phase 2: Destroy sleeping sandboxes that have been idle > DESTROY_THRESHOLD_MS.
  const sleepingConversations =
    await SandboxResource.dangerouslyGetStaleConversationIds({
      status: "sleeping",
      olderThanMs: DESTROY_THRESHOLD_MS,
      limit: BATCH_SIZE,
    });

  if (sleepingConversations.length > 0) {
    logger.info(
      { count: sleepingConversations.length },
      "Reaper: stale sleeping sandboxes found."
    );

    // Batch-fetch all workspaces to avoid N queries inside the concurrent loop
    const workspaceMap = await fetchWorkspaceMap(sleepingConversations);

    logger.info(
      {
        conversationCount: sleepingConversations.length,
        uniqueWorkspaceCount: workspaceMap.size,
      },
      "Batch-fetched workspaces for sleeping sandboxes"
    );

    await concurrentExecutor(
      sleepingConversations,
      async ({ conversationId, workspaceModelId }) => {
        const workspace = workspaceMap.get(workspaceModelId);

        if (!workspace) {
          logger.warn(
            { conversationId, workspaceModelId },
            "Workspace not found, skipping"
          );
          return;
        }

        const auth = await Authenticator.internalBuilderForWorkspace(
          workspace.sId
        );
        const result = await SandboxResource.dangerouslyDestroyIfSleeping(
          auth,
          conversationId
        );
        if (result.isErr()) {
          logger.error(
            { conversationId, error: result.error.message },
            "Reaper: failed to destroy sandbox — continuing."
          );
        }
        heartbeat();
      },
      { concurrency: REAPER_CONCURRENCY }
    );
  }

  return (
    runningConversations.length >= BATCH_SIZE ||
    sleepingConversations.length >= BATCH_SIZE
  );
}
