import type * as activities from "@app/temporal/activation_scheduler/activities";
import { proxyActivities } from "@temporalio/workflow";

const { runActivationForWorkspaceActivity } = proxyActivities<
  typeof activities
>({
  startToCloseTimeout: "5 minutes",
});

/**
 * Workspace-level workflow (one per workspace, schedule-triggered).
 * The Temporal schedule applies jitter to spread load across the region's
 * workday start.
 */
export async function activationWorkspaceWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}): Promise<void> {
  await runActivationForWorkspaceActivity({ workspaceId });
}
