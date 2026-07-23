import type * as activities from "@app/poke/temporal/activities";
import type { ModelId } from "@app/types/shared/model_id";
import { ApplicationFailure, proxyActivities } from "@temporalio/workflow";

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
  emitDeletionAuditActivity,
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
  deleteDataSources,
  deletedByUserModelId,
  workspaceId,
  workspaceHasBeenRelocated = false,
}: {
  deleteDataSources: boolean;
  deletedByUserModelId?: ModelId;
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

  const { canDelete, githubAdminModelIds } = await prepareDeletionActivity({
    deleteDataSources,
    notifyGitHubAdmins: !workspaceHasBeenRelocated,
    workspaceId,
  });
  if (!canDelete) {
    throw ApplicationFailure.nonRetryable(
      "Workspace deletion refused because data sources exist without explicit opt-in.",
      "WORKSPACE_DELETION_REFUSED"
    );
  }

  await emitDeletionAuditActivity({
    deletedByUserModelId,
    relocated: workspaceHasBeenRelocated,
    workspaceId,
  });
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
  if (githubAdminModelIds.length > 0) {
    await sendGitHubNoticesActivity({ githubAdminModelIds });
  }
  await deleteTranscriptsActivity({ workspaceId });
  await deletePluginRunsActivity({ workspaceId });
  await deleteWorkspaceActivity({ workspaceId });
  await deleteWorkOSOrganization({ workspaceId, workspaceHasBeenRelocated });
}
