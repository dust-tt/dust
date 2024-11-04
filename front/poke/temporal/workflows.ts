import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/poke/temporal/activities";

// Create a single proxy with all activities
const activityProxies = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});

const {
  deleteAgentsActivity,
  deleteAppsActivity,
  deleteConversationsActivity,
  deleteMembersActivity,
  deleteRunOnDustAppsActivity,
  deleteSpacesActivity,
  deleteWorkspaceActivity,
  isWorkflowDeletableActivity,
  scrubDataSourceActivity,
  scrubSpaceActivity,
} = activityProxies;

export async function scrubDataSourceWorkflow({
  dataSourceId,
  workspaceId,
}: {
  dataSourceId: string;
  workspaceId: string;
}) {
  await scrubDataSourceActivity({ dataSourceId, workspaceId });
}

export async function scrubSpaceWorkflow({
  spaceId,
  workspaceId,
}: {
  spaceId: string;
  workspaceId: string;
}) {
  await scrubSpaceActivity({ spaceId, workspaceId });
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
  await deleteSpacesActivity({ workspaceId });
  await deleteWorkspaceActivity({ workspaceId });
}
