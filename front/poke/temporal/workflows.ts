import { proxyActivities } from "@temporalio/workflow";

import type * as activities from "@app/poke/temporal/activities";

const { scrubDataSourceActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});

const { isWorkflowDeletableActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});
const { deleteConversationsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});
const { deleteAgentsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});
const { deleteAppsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});
const { deleteRunOnDustAppsActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});
const { deleteMembersActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});
const { deleteWorkspaceActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "60 minute",
});

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
