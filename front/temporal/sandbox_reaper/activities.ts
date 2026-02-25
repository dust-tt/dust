import { SandboxResource } from "@app/lib/resources/sandbox_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import { heartbeat } from "@temporalio/activity";

import { BATCH_SIZE, DESTROY_THRESHOLD_MS, SLEEP_THRESHOLD_MS } from "./config";

const REAPER_CONCURRENCY = 16;

/**
 * Process one batch of stale sandboxes. Returns `true` when either query
 * returned a full batch, signalling the workflow to loop for more.
 */
export async function reapStaleSandboxesActivity(): Promise<boolean> {
  // Phase 1: Sleep running sandboxes that have been idle > SLEEP_THRESHOLD_MS.
  const runningConversationIds =
    await SandboxResource.dangerouslyGetStaleConversationIds({
      status: "running",
      olderThanMs: SLEEP_THRESHOLD_MS,
      limit: BATCH_SIZE,
    });

  if (runningConversationIds.length > 0) {
    logger.info(
      { count: runningConversationIds.length },
      "Reaper: stale running sandboxes found."
    );

    await concurrentExecutor(
      runningConversationIds,
      async (conversationId) => {
        const result =
          await SandboxResource.dangerouslySleepIfRunning(conversationId);
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
  const sleepingConversationIds =
    await SandboxResource.dangerouslyGetStaleConversationIds({
      status: "sleeping",
      olderThanMs: DESTROY_THRESHOLD_MS,
      limit: BATCH_SIZE,
    });

  if (sleepingConversationIds.length > 0) {
    logger.info(
      { count: sleepingConversationIds.length },
      "Reaper: stale sleeping sandboxes found."
    );

    await concurrentExecutor(
      sleepingConversationIds,
      async (conversationId) => {
        const result =
          await SandboxResource.dangerouslyDestroyIfSleeping(conversationId);
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
    runningConversationIds.length >= BATCH_SIZE ||
    sleepingConversationIds.length >= BATCH_SIZE
  );
}
