import { Authenticator } from "@app/lib/auth";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";

export async function webhookCleanupActivity() {
  const workspacesToCleanup =
    await WebhookRequestResource.getWorkspaceIdsWithTooManyRequests();

  if (workspacesToCleanup.length === 0) {
    logger.info("No workspaces with too many webhook requests to cleanup.");
    return;
  }

  for (const workspaceId of workspacesToCleanup) {
    const workspace = await WorkspaceResource.fetchByModelId(workspaceId);
    if (!workspace) {
      logger.error({ workspaceId }, "Workspace not found.");
      continue;
    }
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await WebhookRequestResource.cleanUpWorkspace(auth);
    logger.info(
      { workspaceId: workspace.sId },
      "Cleaned up webhook requests for workspace."
    );
  }
}
