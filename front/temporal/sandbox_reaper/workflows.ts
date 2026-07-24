import type * as activities from "@app/temporal/sandbox_reaper/activities";
import type {
  ReaperCursor,
  ReaperPhase,
} from "@app/temporal/sandbox_reaper/activities";
import { log, proxyActivities } from "@temporalio/workflow";

const { reapStaleSandboxesActivity } = proxyActivities<typeof activities>({
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
  for (const phase of REAPER_PHASES) {
    let cursor: ReaperCursor | null = null;
    let processedBatches = 0;

    while (processedBatches < MAX_BATCHES_PER_PHASE) {
      const result: activities.ReapStaleSandboxesActivityResult =
        await reapStaleSandboxesActivity({ cursor, phase });
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
