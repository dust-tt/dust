import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { Authenticator } from "@app/lib/auth";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { matchPayload, parseMatcherExpression } from "@app/lib/matcher";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import { checkTriggerForExecutionPerDayLimit } from "@app/lib/triggers/common";
import { launchAgentTriggerWorkflow } from "@app/lib/triggers/temporal/common/client";
import {
  checkSignature,
  checkWebhookRequestForRateLimit,
} from "@app/lib/triggers/webhook";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { ContentFragmentInputWithFileIdType } from "@app/types";
import { assertNever, errorToString, normalizeError } from "@app/types";
import type { WebhookTriggerType } from "@app/types/assistant/triggers";
import { isWebhookTrigger } from "@app/types/assistant/triggers";
import { WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP } from "@app/types/triggers/webhooks";

class TriggerNonRetryableError extends Error {}

export async function runTriggerWebhookActivity({
  workspaceId,
  webhookRequestId,
}: {
  workspaceId: string;
  webhookRequestId: number;
}) {
  let auth: Authenticator | null = null;
  try {
    auth = await Authenticator.internalBuilderForWorkspace(workspaceId);
  } catch (error) {
    const errorMessage = "Invalid authentication.";
    logger.error({ workspaceId, error }, errorMessage);
    throw new TriggerNonRetryableError(errorMessage);
  }

  const webhookRequest = await WebhookRequestResource.fetchById(
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
  let body: any;
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
    if (!webhookSource.signatureHeader || !webhookSource.signatureAlgorithm) {
      const errorMessage =
        "Webhook source is missing header or algorithm configuration.";
      await webhookRequest.markAsFailed(errorMessage);
      logger.error({ workspaceId, webhookRequestId }, errorMessage);
      throw new TriggerNonRetryableError(errorMessage);
    }

    const r = checkSignature({
      headerName: webhookSource.signatureHeader,
      algorithm: webhookSource.signatureAlgorithm,
      secret: webhookSource.secret,
      headers,
      body,
    });

    if (r.isErr()) {
      const errorMessage = r.error.message;
      await webhookRequest.markAsFailed(errorMessage);
      logger.error({ workspaceId, webhookRequestId }, errorMessage);
      throw new TriggerNonRetryableError(errorMessage);
    }
  }

  // Check if the webhook request is rate limited
  const rateLimiterRes = await checkWebhookRequestForRateLimit(auth);
  if (rateLimiterRes.isErr()) {
    const errorMessage = rateLimiterRes.error.message;
    await webhookRequest.markAsFailed(errorMessage);
    logger.error({ workspaceId, webhookRequestId }, errorMessage);
    throw new TriggerNonRetryableError(errorMessage);
  }

  // Filter out non-subscribed events
  if (webhookSource.kind !== "custom") {
    const { type, field } =
      WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[webhookSource.kind].eventCheck;

    // Node http module behavior is to lowercase all headers keys
    let receivedEventName: string | undefined;
    switch (type) {
      case "headers":
        receivedEventName = headers[field.toLowerCase()];
        break;
      case "body":
        receivedEventName = body[field.toLowerCase()];
        break;
      default:
        assertNever(type);
    }

    if (
      receivedEventName === undefined ||
      // Event not in preset
      !WEBHOOK_SOURCE_KIND_TO_PRESETS_MAP[webhookSource.kind].events
        .map((event) => event.name)
        .includes(receivedEventName) ||
      // Event not subscribed
      !webhookSource.subscribedEvents.includes(receivedEventName)
    ) {
      const errorMessage =
        "Webhook event not subscribed or not in preset. Potential cause: the events selection was manually modified on the service.";
      await webhookRequest.markAsFailed(errorMessage);
      logger.error(
        { workspaceId, webhookRequestId, eventName: receivedEventName },
        errorMessage
      );
      throw new TriggerNonRetryableError(errorMessage);
    }
  }

  // Fetch all triggers based on the webhook source id.
  const views = await WebhookSourcesViewResource.listByWebhookSource(
    auth,
    webhookSource.id
  );

  // Fetch all triggers based on the webhook source id and flatten the result.
  const triggers = (
    await concurrentExecutor(
      views,
      async (view) => {
        const triggers = await TriggerResource.listByWebhookSourceViewId(
          auth,
          view.id
        );
        return triggers;
      },
      { concurrency: 10 }
    )
  )
    .flat()
    .map((t) => t.toJSON())
    // Filter here to avoid a lot of type checking later.
    .filter(isWebhookTrigger)
    // Filter out disabled triggers
    .filter((t) => t.enabled);

  const filteredTriggers: WebhookTriggerType[] = [];

  for (const t of triggers) {
    if (!t.configuration.filter) {
      // No filter, add the trigger
      filteredTriggers.push(t);
    } else {
      try {
        // Filter triggers by payload matching
        const parsedFilter = parseMatcherExpression(t.configuration.filter);
        const r = matchPayload(body, parsedFilter);
        if (r) {
          // Filter matches, add the trigger if not rate limited
          const rateLimiterRes = await checkTriggerForExecutionPerDayLimit(
            auth,
            {
              trigger: t,
            }
          );
          if (rateLimiterRes.isErr()) {
            const errorMessage = rateLimiterRes.error.message;
            await webhookRequest.markRelatedTrigger(
              t,
              "rate_limited",
              errorMessage
            );
            logger.warn(
              { workspaceId, webhookRequestId, triggerId: t.sId },
              errorMessage
            );
          } else {
            filteredTriggers.push(t);
          }
        } else {
          // Filter doesn't match, skip the trigger but store in the mapping list.
          await webhookRequest.markRelatedTrigger(t, "not_matched");
        }
      } catch (err) {
        logger.error(
          {
            triggerId: t.id,
            triggerName: t.name,
            filter: t.configuration.filter,
            err: normalizeError(err),
          },
          "Invalid filter expression in webhook trigger"
        );
      }
    }
  }

  // If no triggers match after filtering, return early without launching workflows.
  if (filteredTriggers.length === 0) {
    await webhookRequest.markAsProcessed();
    return;
  }

  // Check if any of the triggers requires the payload.
  const requiresPayload = filteredTriggers.some(
    (t) => t.configuration.includePayload
  );

  // If we need the payload, create a content fragment for it.
  let contentFragment: ContentFragmentInputWithFileIdType | undefined;
  if (requiresPayload) {
    const contentFragmentRes = await toFileContentFragment(auth, {
      contentFragment: {
        contentType: "application/json",
        content: JSON.stringify(body),
        title: `Webhook body (source id: ${webhookSource.id}, date: ${new Date().toISOString()})`,
      },
      fileName: `webhook_body_${webhookSource.id}_${Date.now()}.json`,
    });

    if (contentFragmentRes.isErr()) {
      const errorMessage =
        "Error creating file content fragment from webhook request.";
      await webhookRequest.markAsFailed(errorMessage);
      logger.error({ workspaceId, webhookRequestId }, errorMessage);
      throw new TriggerNonRetryableError(errorMessage);
    }

    contentFragment = contentFragmentRes.value;
  }

  // Launch all the triggers' workflows concurrently.
  await concurrentExecutor(
    filteredTriggers,
    async (t) => {
      // Get the trigger's user and create a new authenticator
      const user = await UserResource.fetchByModelId(t.editor);

      if (!user) {
        logger.error({ triggerId: t.id }, "Trigger editor not found.");
        await webhookRequest.markRelatedTrigger(t, "workflow_start_failed");
      } else {
        const auth = await Authenticator.fromUserIdAndWorkspaceId(
          user.sId,
          workspaceId
        );
        if (t.configuration.includePayload && !contentFragment) {
          throw new TriggerNonRetryableError(
            "One of the triggers requires the payload, but the contentFragment is missing. It should never happen as the content fragment is created if any of the triggers requires the payload."
          );
        }

        // Fire and forget
        const result = await launchAgentTriggerWorkflow({
          auth,
          trigger: t,
          contentFragment,
        });

        if (result.isErr()) {
          await webhookRequest.markRelatedTrigger(t, "workflow_start_failed");
          logger.error(
            { triggerId: t.id, error: result.error },
            "Error launching agent trigger workflow."
          );
        } else {
          await webhookRequest.markRelatedTrigger(
            t,
            "workflow_start_succeeded"
          );
        }
      }
    },
    { concurrency: 10 }
  );

  // Finally, mark the webhook request as processed.
  await webhookRequest.markAsProcessed();
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
