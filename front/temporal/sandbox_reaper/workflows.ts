import type * as activities from "@app/temporal/sandbox_reaper/activities";
import type {
  ReaperCursor,
  ReaperPhase,
} from "@app/temporal/sandbox_reaper/activities";
import { log, patched, proxyActivities } from "@temporalio/workflow";

const { reapSandboxPhaseActivity, reapStaleSandboxesActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
    heartbeatTimeout: "1 minute",
    retry: {
      maximumAttempts: 3,
    },
  });

const REAPER_PHASES = [
  "kill_requested",
  "running",
  "pending_approval",
  "sleeping",
] satisfies ReaperPhase[];

const MAX_BATCHES_PER_PHASE = 100;

export async function sandboxReaperWorkflow(): Promise<void> {
  // Patch lifecycle for phase pagination:
  // 1. Now: pre-patch executions retain the no-argument boolean activity.
  // 2. After 2026-08-07: replace patched() with deprecatePatch() and remove the
  //    compatibility branch and activity.
  // 3. After 2026-08-21: remove deprecatePatch() and the patch marker.
  if (!patched("sandbox-reaper-phase-pagination")) {
    let hasMore = true;
    while (hasMore) {
      hasMore = await reapStaleSandboxesActivity();
    }
    return;
  }

  for (const phase of REAPER_PHASES) {
    let cursor: ReaperCursor | null = null;
    let processedBatches = 0;

    while (processedBatches < MAX_BATCHES_PER_PHASE) {
      const result: activities.ReapSandboxPhaseActivityResult =
        await reapSandboxPhaseActivity({ cursor, phase });
      processedBatches += 1;

      if (!result.nextCursor) {
        cursor = null;
        break;
      }
      cursor = result.nextCursor;
    }

    if (cursor) {
      log.warn("Reaper phase reached its batch limit.", {
        phase,
        processedBatches,
        sandboxModelId: cursor.sandboxModelId,
        timestampMs: cursor.timestampMs,
      });
    }
  }
}

export { sandboxKillRequesterWorkflow } from "./kill_requester/workflows";
