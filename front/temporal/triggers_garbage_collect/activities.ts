import { Authenticator } from "@app/lib/auth";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import logger from "@app/logger/logger";

export async function webhookCleanupActivity() {
  const workspacesToCleanup =
    await WebhookRequestResource.getWorkspacesWithTooManyRequests();

  if (workspacesToCleanup.length === 0) {
    logger.info("No workspaces with too many webhook requests to cleanup.");
    return;
  }

  for (const workspace of workspacesToCleanup) {
    const auth = await Authenticator.internalAdminForWorkspace(workspace.sId);
    await WebhookRequestResource.cleanUpWorkspace(auth);
    logger.info(
      { workspaceId: workspace.sId },
      "Cleaned up webhook requests for workspace."
    );
  }
}
