import type * as activities from "@app/temporal/project_todo/activities";
import {
  condition,
  continueAsNew,
  proxyActivities,
  setHandler,
  uuid4,
} from "@temporalio/workflow";

import { todoRefreshSignal } from "./signals";

const { analyzeProjectTodosActivity, mergeTodosForProjectActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
  });

/** Keep history bounded: ~500 hourly runs ≈ 3 weeks before a fresh execution (same workflow id). */
const RUNS_BEFORE_CONTINUE_AS_NEW = 500;

/** Milliseconds until the next UTC instant whose minute equals `offsetMinutes` (seconds/ms zero). */
function msUntilNextUtcMinuteSlot(offsetMinutes: number): number {
  const now = Date.now();
  const target = new Date(now);
  target.setUTCSeconds(0, 0);
  target.setUTCMinutes(offsetMinutes);
  if (target.getTime() <= now) {
    target.setUTCHours(target.getUTCHours() + 1);
  }
  return Math.max(1, target.getTime() - now);
}

/**
 * One durable workflow per project so analyze + merge never run concurrently for the same space.
 * Each loop iteration **awaits** `condition` (timer or signal)—no busy spin.
 * Waits until the next hourly UTC slot (minute = scheduleOffsetMinutes, spread across projects) or
 * until `todoRefreshSignal` fires for an on-demand run (e.g. right after enabling generation).
 * Periodically `continueAsNew` resets workflow history while keeping the same workflow id.
 */
export async function projectTodoWorkflow({
  workspaceId,
  spaceId,
  scheduleOffsetMinutes,
}: {
  workspaceId: string;
  spaceId: string;
  scheduleOffsetMinutes: number;
}): Promise<void> {
  let pendingRefresh = false;

  setHandler(todoRefreshSignal, (_payload: string) => {
    pendingRefresh = true;
  });

  let completedRunsInThisExecution = 0;

  while (true) {
    const msUntilSlot = msUntilNextUtcMinuteSlot(scheduleOffsetMinutes);
    const signaled = await condition(() => pendingRefresh, msUntilSlot);

    if (signaled) {
      pendingRefresh = false;
    }

    const runId = uuid4();
    await analyzeProjectTodosActivity({ workspaceId, spaceId, runId });
    await mergeTodosForProjectActivity({ workspaceId, spaceId, runId });

    completedRunsInThisExecution++;

    // Drain signalled runs before continueAsNew so we don't drop an immediate refresh.
    if (pendingRefresh) {
      continue;
    }

    if (completedRunsInThisExecution >= RUNS_BEFORE_CONTINUE_AS_NEW) {
      await continueAsNew<typeof projectTodoWorkflow>({
        workspaceId,
        spaceId,
        scheduleOffsetMinutes,
      });
    }
  }
}
