import { SubscriptionResource } from "@app/lib/resources/subscription_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";

export async function invalidateRelocatedWorkspaceCaches(
  workspaceId: string
): Promise<void> {
  const [workspaceModelId] = await WorkspaceResource.fetchModelIdsByIds([
    workspaceId,
  ]);

  if (!workspaceModelId) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }

  await Promise.all([
    WorkspaceResource.invalidateCache(workspaceId),
    SubscriptionResource.invalidateSubscriptionCache(workspaceModelId),
  ]);
}
