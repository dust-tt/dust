import type * as activities from "@app/temporal/sandbox_reaper/activities";
import type {
  ReaperCursor,
  ReaperPhase,
} from "@app/temporal/sandbox_reaper/activities";
import { log, patched, proxyActivities } from "@temporalio/workflow";

const { reapSandboxPhaseActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
  },
});

// Legacy phase order, kept for replay of workflows that started before the
// preemptible maintenance patch.
const LEGACY_REAPER_PHASES = [
  "kill_requested",
  "running",
  "pending_approval",
  "kill_requested_sleeping",
  "sleeping",
] satisfies ReaperPhase[];

// These phases free E2B concurrency and must preempt maintenance work.
const CAPACITY_PHASES = ["kill_requested", "running"] satisfies ReaperPhase[];

// These phases operate on sandboxes that are already paused. Process one batch
// at a time so newly stale running sandboxes never wait behind a full cleanup
// sweep.
const MAINTENANCE_PHASES = [
  "pending_approval",
  "kill_requested_sleeping",
  "sleeping",
] satisfies ReaperPhase[];

const MAX_BATCHES_PER_PHASE = 200;

function logPhaseBatchLimit(
  phase: ReaperPhase,
  cursor: ReaperCursor,
  processedBatches: number
): void {
  log.warn("Reaper phase reached its batch limit.", {
    phase,
    processedBatches,
    sandboxModelId: cursor.sandboxModelId,
    timestampMs: cursor.timestampMs,
  });
}

async function drainPhase(phase: ReaperPhase): Promise<boolean> {
  let cursor: ReaperCursor | null = null;

  for (
    let processedBatches = 0;
    processedBatches < MAX_BATCHES_PER_PHASE;
    processedBatches += 1
  ) {
    const result: activities.ReapSandboxPhaseActivityResult =
      await reapSandboxPhaseActivity({ cursor, phase });

    if (!result.nextCursor) {
      return true;
    }
    cursor = result.nextCursor;
  }

  if (cursor) {
    logPhaseBatchLimit(phase, cursor, MAX_BATCHES_PER_PHASE);
  }
  return false;
}

async function drainCapacityPhases(): Promise<boolean> {
  for (const phase of CAPACITY_PHASES) {
    const fullyDrained = await drainPhase(phase);
    if (!fullyDrained) {
      return false;
    }
  }
  return true;
}

async function runLegacyReaperWorkflow(): Promise<void> {
  for (const phase of LEGACY_REAPER_PHASES) {
    await drainPhase(phase);
  }
}

async function runPreemptibleReaperWorkflow(): Promise<void> {
  const capacityFullyDrained = await drainCapacityPhases();
  if (!capacityFullyDrained) {
    return;
  }

  for (const phase of MAINTENANCE_PHASES) {
    let cursor: ReaperCursor | null = null;

    for (
      let processedBatches = 0;
      processedBatches < MAX_BATCHES_PER_PHASE;
      processedBatches += 1
    ) {
      const result: activities.ReapSandboxPhaseActivityResult =
        await reapSandboxPhaseActivity({ cursor, phase });
      cursor = result.nextCursor;

      const capacityFullyDrained = await drainCapacityPhases();
      if (!capacityFullyDrained) {
        return;
      }

      if (!cursor) {
        break;
      }
    }

    if (cursor) {
      logPhaseBatchLimit(phase, cursor, MAX_BATCHES_PER_PHASE);
    }
  }
}

export async function sandboxReaperWorkflow(): Promise<void> {
  // Patch lifecycle for preemptible maintenance:
  // 1. Now: in-flight executions replay the legacy phase loop.
  // 2. After 2026-08-18: replace patched() with deprecatePatch() and remove
  //    runLegacyReaperWorkflow and LEGACY_REAPER_PHASES.
  // 3. After 2026-09-01: remove deprecatePatch() and the patch marker.
  if (!patched("sandbox-reaper-preemptible-maintenance")) {
    await runLegacyReaperWorkflow();
    return;
  }

  await runPreemptibleReaperWorkflow();
}

export { sandboxKillRequesterWorkflow } from "./kill_requester/workflows";
