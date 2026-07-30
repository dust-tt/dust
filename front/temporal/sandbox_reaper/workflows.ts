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

// Legacy phase order, kept for replay of pre-patch executions.
const REAPER_PHASES_V1 = [
  "kill_requested",
  "running",
  "pending_approval",
  "sleeping",
] satisfies ReaperPhase[];

// Priority order: pausing stale awake sandboxes and destroying awake
// kill-requested sandboxes directly cap cluster concurrency, so they run
// first. Kill-requested sleeping sandboxes are pure storage cleanup (they are
// destroyed lazily on user access) and are swept last, when higher-priority
// phases leave room in the run.
const REAPER_PHASES_V2 = [
  "running",
  "pending_approval",
  "kill_requested",
  "sleeping",
  "kill_requested_sleeping",
] satisfies ReaperPhase[];

const MAX_BATCHES_PER_PHASE = 200;

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

  // Patch for prioritized phases: pre-patch executions replay the legacy phase
  // order. After deploy, pause the schedule, terminate any open
  // sandboxReaperWorkflow, wait for the worker rollout to finish, then remove
  // REAPER_PHASES_V1 and this patched() call immediately.
  const phases = patched("sandbox-reaper-prioritized-phases")
    ? REAPER_PHASES_V2
    : REAPER_PHASES_V1;

  for (const phase of phases) {
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
