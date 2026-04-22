import type * as activities from "@app/temporal/project_todo/activities";
import { proxyActivities, uuid4 } from "@temporalio/workflow";

const { analyzeProjectTodosActivity, mergeTodosForProjectActivity } =
  proxyActivities<typeof activities>({
    startToCloseTimeout: "10 minutes",
  });

// Cron-driven workflow (see `cronSchedule` in `launchOrSignalProjectTodoWorkflow`): each
// execution runs once and completes; Temporal starts the next run on schedule until the
// workflow is terminated (e.g. project archived or deleted).
export async function projectTodoWorkflow({
  workspaceId,
  spaceId,
}: {
  workspaceId: string;
  spaceId: string;
}): Promise<void> {
  // Generate a unique run ID to correlate all log lines across both activities.
  const runId = uuid4();
  await analyzeProjectTodosActivity({ workspaceId, spaceId, runId });
  await mergeTodosForProjectActivity({ workspaceId, spaceId, runId });
}
