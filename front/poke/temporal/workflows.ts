import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/poke/temporal/activities";

// Create a single proxy with all activities
const activityProxies = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});

const {
  scrubDataSourceActivity,
  isWorkflowDeletableActivity,
  deleteConversationsActivity,
  deleteAgentsActivity,
  deleteAppsActivity,
  deleteRunOnDustAppsActivity,
  deleteMembersActivity,
  deleteWorkspaceActivity,
} = activityProxies;

export async function scrubDataSourceWorkflow({
  dustAPIProjectId,
}: {
  dustAPIProjectId: string;
}) {
  await scrubDataSourceActivity({ dustAPIProjectId });
}

export async function deleteWorkspaceWorkflow({
  workspaceId,
}: {
  workspaceId: string;
}) {
  const isDeletable = await isWorkflowDeletableActivity({ workspaceId });
  if (!isDeletable) {
    return;
  }
  await deleteConversationsActivity({ workspaceId });
  await deleteAgentsActivity({ workspaceId });
  await deleteAppsActivity({ workspaceId });
  await deleteRunOnDustAppsActivity({ workspaceId });
  await deleteMembersActivity({ workspaceId });
  await deleteWorkspaceActivity({ workspaceId });
}
