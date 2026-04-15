import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/project_todo/activities";
import { MERGE_THROTTLE_MS } from "@app/temporal/project_todo/config";
import { mergeRequestSignal } from "@app/temporal/project_todo/signals";
import {
  condition,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";

const { mergeTodosForProjectActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

// Cron-driven workflow (see `cronSchedule` in `launchOrSignalProjectTodoWorkflow`): each
// execution runs once and completes; Temporal starts the next run on schedule until the
// workflow is terminated (e.g. project archived or deleted).
export async function projectTodoWorkflow({
  authType,
  spaceId,
}: {
  authType: AuthenticatorType;
  spaceId: string;
}): Promise<void> {
  // Do nothing for now
  // await mergeTodosForProjectActivity({ authType, spaceId });
}

// One long-running workflow per (workspace, project/space). Receives merge-request signals
// and runs the LLM merge at most once per MERGE_THROTTLE_MS, batching dirty conversations.
export async function projectMergeWorkflow({
  authType,
  spaceId,
}: {
  authType: AuthenticatorType;
  spaceId: string;
}): Promise<void> {
  let hasPendingWork = false;
  let isCoolingDown = false;

  setHandler(mergeRequestSignal, () => {
    hasPendingWork = true;
  });

  // Process merge requests, throttled to at most once per MERGE_THROTTLE_MS.
  // Signals that arrive during the cool-down are coalesced into the next run.
  while (true) {
    await condition(() => hasPendingWork && !isCoolingDown);
    hasPendingWork = false;
    isCoolingDown = true;

    await mergeTodosForProjectActivity({ authType, spaceId });

    await sleep(MERGE_THROTTLE_MS);
    isCoolingDown = false;
  }
}
