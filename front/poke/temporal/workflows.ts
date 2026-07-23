import type * as activities from "@app/poke/temporal/activities";
import { proxyActivities } from "@temporalio/workflow";

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
  deleteRemoteMCPServersActivity,
  deleteSkillsActivity,
  deleteSpacesActivity,
  deleteWebhookSourcesActivity,
  deleteTagsActivity,
  deleteTranscriptsActivity,
  deleteWorkOSOrganization,
  deleteWorkspaceUserMetadataActivity,
  isWorkflowDeletableActivity,
  prepareDeletionActivity,
  scrubDataSourceActivity,
  scrubSpaceActivity,
  sendGitHubNoticesActivity,
} = normalActivityProxies;

const {
  deleteConversationsActivity,
  deleteWorkspaceActivity,
  deleteRunOnDustAppsActivity,
} = longActivityProxies;

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
  deleteDataSources = true,
  workspaceId,
  workspaceHasBeenRelocated = false,
}: {
  deleteDataSources?: boolean;
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

  const { canDelete, githubAdminEmails } = await prepareDeletionActivity({
    deleteDataSources,
    workspaceId,
  });
  if (!canDelete) {
    return;
  }

  await deleteMembersActivity({ workspaceId });
  await deleteConversationsActivity({ workspaceId });
  await deleteSkillsActivity({ workspaceId });
  await deleteRemoteMCPServersActivity({ workspaceId });
  await deleteAgentsActivity({ workspaceId });
  await deleteRunOnDustAppsActivity({ workspaceId });
  await deleteAppsActivity({ workspaceId });
  await deleteWorkspaceUserMetadataActivity({ workspaceId });
  await deleteTagsActivity({ workspaceId });
  await deleteWebhookSourcesActivity({ workspaceId });
  await deleteSpacesActivity({ workspaceId });
  await sendGitHubNoticesActivity({ adminEmails: githubAdminEmails });
  await deleteTranscriptsActivity({ workspaceId });
  await deletePluginRunsActivity({ workspaceId });
  await deleteWorkspaceActivity({ workspaceId });
  await deleteWorkOSOrganization({ workspaceId, workspaceHasBeenRelocated });
}
