import type { AuthenticatorType } from "@app/lib/auth";
import type * as activities from "@app/temporal/project_todo/activities";
import {
  MERGE_THROTTLE_MS,
  TODO_THROTTLE_MS,
} from "@app/temporal/project_todo/config";
import {
  mergeRequestSignal,
  todoCompleteSignal,
  todoRefreshSignal,
} from "@app/temporal/project_todo/signals";
import {
  condition,
  proxyActivities,
  setHandler,
  sleep,
} from "@temporalio/workflow";

const {
  analyzeProjectTodosActivity,
  signalOrStartMergeWorkflowActivity,
  mergeTodosForProjectActivity,
} = proxyActivities<typeof activities>({
  startToCloseTimeout: "10 minutes",
});

// Per-conversation workflow. Throttles analysis to at most once per TODO_THROTTLE_MS
// and signals the per-project merge workflow after each successful run. spaceId
// identifies the project the conversation belongs to and is forwarded to the merge
// workflow.
export async function projectTodoWorkflow({
  authType,
  conversationId,
  messageId,
  spaceId,
}: {
  authType: AuthenticatorType;
  conversationId: string;
  messageId: string;
  spaceId: string;
}): Promise<void> {
  let needsAnalysis = true;
  let complete = false;
  let latestMessageId: string | null = null;
  let isCoolingDown = false;

  setHandler(todoRefreshSignal, (msgId: string) => {
    needsAnalysis = true;
    latestMessageId = msgId;
  });

  setHandler(todoCompleteSignal, (msgId: string) => {
    needsAnalysis = true;
    complete = true;
    latestMessageId = msgId;
  });

  while (!complete) {
    // Wait until there is work to do AND the throttle cool-down has elapsed.
    await condition(() => needsAnalysis && !isCoolingDown);
    needsAnalysis = false;
    isCoolingDown = true;
    const msgId = latestMessageId;

    if (msgId) {
      await analyzeProjectTodosActivity({
        authType,
        conversationId,
        messageId: msgId,
      });
      // Signal the per-project merge workflow that fresh analysis data is available.
      // Uses signalWithStart so the merge workflow is started if not already running.
      await signalOrStartMergeWorkflowActivity({ authType, spaceId });
    }

    // Cool-down: don't run again for TODO_THROTTLE_MS. Exit early if the complete
    // signal arrives so the final analysis is not delayed unnecessarily.
    await condition(() => complete, TODO_THROTTLE_MS);
    isCoolingDown = false;
  }

  // Final analysis + merge signal after completion.
  if (latestMessageId) {
    await analyzeProjectTodosActivity({
      authType,
      conversationId,
      messageId: latestMessageId,
    });
    await signalOrStartMergeWorkflowActivity({ authType, spaceId });
  }
}

// One long-running workflow per (workspace, project/space). Receives merge-request signals
// from per-conversation projectTodoWorkflows and runs the LLM merge at most once per
// MERGE_THROTTLE_MS, batching all dirty conversations into a single call.
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
