import { Authenticator } from "@app/lib/auth";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  checkSignature,
  filterTriggers,
  launchTriggersWorkflows,
  validateEventSubscription,
} from "@app/lib/triggers/webhook";
import logger from "@app/logger/logger";
import { errorToString } from "@app/types";

class TriggerNonRetryableError extends Error {}

export async function runTriggerWebhookActivity({
  workspaceId,
  webhookRequestId,
}: {
  workspaceId: string;
  webhookRequestId: number;
}): Promise<{
  success: boolean;
  message: string;
}> {
  const auth = await Authenticator.internalBuilderForWorkspace(workspaceId);

  const webhookRequest = await WebhookRequestResource.fetchByModelIdWithAuth(
    auth,
    webhookRequestId
  );

  if (!webhookRequest) {
    const errorMessage = "Unable to fetch webhook request.";
    logger.error({ workspaceId, webhookRequestId }, errorMessage);
    throw new TriggerNonRetryableError(errorMessage);
  }

  const webhookSource = await WebhookSourceResource.fetchByModelId(
    webhookRequest.webhookSourceId
  );

  if (!webhookSource) {
    const errorMessage = "Unable to fetch webhook source.";
    await webhookRequest.markAsFailed(errorMessage);
    logger.error({ workspaceId, webhookRequestId }, errorMessage);
    throw new TriggerNonRetryableError(errorMessage);
  }

  if (webhookSource.workspaceId !== auth.getNonNullableWorkspace().id) {
    const errorMessage = "Webhook source not found in workspace.";
    await webhookRequest.markAsFailed(errorMessage);
    logger.error({ workspaceId, webhookRequestId }, errorMessage);
    throw new TriggerNonRetryableError(errorMessage);
  }

  // Process the webhook request.

  // Fetch the file from GCS
  let headers: Record<string, string>;
  let body: Record<string, unknown>;
  try {
    const bucket = getWebhookRequestsBucket();
    const file = bucket.file(
      WebhookRequestResource.getGcsPath({
        workspaceId: auth.getNonNullableWorkspace().sId,
        webhookSourceId: webhookSource.id,
        webRequestId: webhookRequest.id,
      })
    );
    const [content] = await file.download();
    const { headers: h, body: b } = JSON.parse(content.toString());
    headers = h;
    body = b;
  } catch (error) {
    const errorAsString = errorToString(error);
    const errorMessage = "Unable to fetch webhook request content from GCS.";
    await webhookRequest.markAsFailed(errorMessage + " " + errorAsString);
    logger.error(
      { workspaceId, webhookRequestId, error: errorAsString },
      errorMessage
    );
    throw new TriggerNonRetryableError(errorMessage);
  }

  // Validate webhook signature if secret is configured
  if (webhookSource.secret) {
    const signatureCheckResult = checkSignature({
      headerName: webhookSource.signatureHeader,
      algorithm: webhookSource.signatureAlgorithm,
      secret: webhookSource.secret,
      headers,
      body,
      provider: webhookSource.provider,
    });

    if (signatureCheckResult.isErr()) {
      const { message: errorMessage } = signatureCheckResult.error;
      await webhookRequest.markAsFailed(errorMessage);
      logger.error({ workspaceId, webhookRequestId }, errorMessage);

      return {
        success: false,
        message: errorMessage,
      };
    }
  }

  const eventValidationResult = await validateEventSubscription({
    webhookSource,
    headers,
    body,
    webhookRequest,
    workspaceId,
    webhookRequestId,
  });

  if (eventValidationResult.isErr()) {
    throw eventValidationResult.error;
  }

  const { skipReason, receivedEventValue } = eventValidationResult.value;

  if (skipReason) {
    return {
      success: true,
      message: `Skipped, reason: ${skipReason}`,
    };
  }

  const filteredTriggersResult = await filterTriggers({
    auth,
    webhookSource,
    receivedEventValue,
    webhookRequest,
    body,
  });

  if (filteredTriggersResult.isErr()) {
    return {
      success: false,
      message: filteredTriggersResult.error.message,
    };
  }

  const filteredTriggers = filteredTriggersResult.value;

  // If no triggers match after filtering, return early without launching workflows.
  if (filteredTriggers.length === 0) {
    await webhookRequest.markAsProcessed();
    return {
      success: true,
      message: "No triggers matched the event.",
    };
  }

  const launchResult = await launchTriggersWorkflows({
    auth,
    filteredTriggers,
    webhookSource,
    body,
    webhookRequest,
  });

  if (launchResult.isErr()) {
    throw new TriggerNonRetryableError(launchResult.error.message);
  }

  // Finally, mark the webhook request as processed.
  await webhookRequest.markAsProcessed();

  return {
    success: true,
    message: "Webhook request processed successfully.",
  };
}

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
