import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/poke/temporal/activities";

// Create a single proxy with all normal and long activities
const normalActivityProxies = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});
const longActivityProxies = proxyActivities<typeof activities>({
  startToCloseTimeout: "180 minute",
});

const {
  deleteAgentsActivity,
  deleteAppsActivity,
  deleteMembersActivity,
  deletePluginRunsActivity,
  deleteRunOnDustAppsActivity,
  deleteSpacesActivity,
  deleteTrackersActivity,
  deleteTranscriptsActivity,
  isWorkflowDeletableActivity,
  scrubDataSourceActivity,
  scrubSpaceActivity,
} = normalActivityProxies;

const { deleteConversationsActivity, deleteWorkspaceActivity } =
  longActivityProxies;

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
  workspaceHasBeenRelocated = false,
}: {
  workspaceId: string;
  workspaceHasBeenRelocated?: boolean;
}) {
  const isDeletable = await isWorkflowDeletableActivity({
    workspaceId,
    workspaceHasBeenRelocated,
  });
  if (!isDeletable) {
    return;
  }

  await deleteConversationsActivity({ workspaceId });
  await deleteAgentsActivity({ workspaceId });
  await deleteRunOnDustAppsActivity({ workspaceId });
  await deleteAppsActivity({ workspaceId });
  await deleteTrackersActivity({ workspaceId });
  await deleteMembersActivity({ workspaceId });
  await deleteSpacesActivity({ workspaceId });
  await deleteTranscriptsActivity({ workspaceId });
  await deletePluginRunsActivity({ workspaceId });
  await deleteWorkspaceActivity({ workspaceId });
}
