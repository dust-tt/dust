import type * as activities from "@app/temporal/agent_inactivity/activities";
import { log, proxyActivities } from "@temporalio/workflow";

import { concurrentExecutor } from "../workflow_utils";

const { getWorkspacesWithInactiveAgentArchivalActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "2 minutes",
});

const { archiveWorkspaceInactiveAgentsActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "2 minutes",
  heartbeatTimeout: "30 seconds",
  retry: {
    // Bounded: archiving is idempotent and tomorrow's tick picks the workspace up again, so a
    // workspace that keeps failing must not hold a worker slot all night.
    maximumAttempts: 3,
    initialInterval: "30 seconds",
    backoffCoefficient: 2,
  },
});

const WORKSPACE_CONCURRENCY = 10;

export interface ArchiveWorkspaceInactiveAgentsWorkflowInput {
  workspaceId: string;
  evaluatedAtMs: number;
}

/**
 * One workspace, run as its own Temporal execution. Not part of the nightly fan-out — Temporal
 * cannot start an activity on its own, so this is the entry point `cli.sh run-workspace` needs to
 * run one workspace's sweep independently and see it in the UI.
 */
export async function archiveWorkspaceInactiveAgentsWorkflow({
  workspaceId,
  evaluatedAtMs,
}: ArchiveWorkspaceInactiveAgentsWorkflowInput): Promise<activities.ArchiveWorkspaceInactiveAgentsActivityResult> {
  return archiveWorkspaceInactiveAgentsActivity({ workspaceId, evaluatedAtMs });
}

export async function archiveInactiveAgentsWorkflow(): Promise<
  activities.ArchiveWorkspaceInactiveAgentsActivityResult[]
> {
  // One instant for the whole sweep. `Date.now()` replays identically in a workflow, so a retried
  // activity re-derives the same cutoff rather than a later one.
  const evaluatedAtMs = Date.now();

  const workspaceIds = await getWorkspacesWithInactiveAgentArchivalActivity();

  // No manual trigger exists that could overlap this run, so nothing dedupes per workspace here —
  // the activity is called directly, not wrapped in a child workflow. One workspace exhausting its
  // retries must not abort the others, so its failure is caught and logged rather than left to
  // propagate through the executor.
  const results = await concurrentExecutor(
    workspaceIds,
    async (workspaceId) => {
      try {
        return await archiveWorkspaceInactiveAgentsActivity({
          workspaceId,
          evaluatedAtMs,
        });
      } catch (err) {
        log.error("[AgentInactivity] Workspace sweep failed", {
          workspaceId,
          err,
        });
        return null;
      }
    },
    { concurrency: WORKSPACE_CONCURRENCY }
  );

  return results.filter(
    (
      result
    ): result is activities.ArchiveWorkspaceInactiveAgentsActivityResult =>
      result !== null
  );
}
