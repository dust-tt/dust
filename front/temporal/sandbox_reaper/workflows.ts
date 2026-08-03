import type * as activities from "@app/temporal/sandbox_reaper/activities";
import type {
  ReaperCursor,
  ReaperPhase,
} from "@app/temporal/sandbox_reaper/activities";
import { log, proxyActivities } from "@temporalio/workflow";

const { reapSandboxPhaseActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
  heartbeatTimeout: "1 minute",
  retry: {
    maximumAttempts: 3,
  },
});

// Priority order: concurrency-freeing work first, then storage cleanup.
// Awake kill-requested sandboxes burn E2B capacity and sit on the user
// recreate path, so they are destroyed first. Stale running sandboxes are
// paused next (same concurrency win, non-destructive). pending_approval is
// cheap DB-only bookkeeping (already paused). Kill-requested sleepers are
// storage/rollout cleanup ahead of cold sleeping destroy - they free no
// concurrency, but taking the provider destroy off ensureActive is hotter
// than 4-day-stale sleepers.
const REAPER_PHASES = [
  "kill_requested",
  "running",
  "pending_approval",
  "kill_requested_sleeping",
  "sleeping",
] satisfies ReaperPhase[];

const MAX_BATCHES_PER_PHASE = 200;

export async function sandboxReaperWorkflow(): Promise<void> {
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
