import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { hasReachedPublicAPILimits } from "@app/lib/api/programmatic_usage_tracking";
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
import { statsDClient } from "@app/logger/statsDClient";
import type { ContentFragmentInputWithFileIdType, Result } from "@app/types";
import { assertNever, Err, errorToString, isString, Ok } from "@app/types";
import type { WebhookTriggerType } from "@app/types/assistant/triggers";
import { isWebhookTrigger } from "@app/types/assistant/triggers";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

class TriggerNonRetryableError extends Error {}

async function validateEventSubscription({
  provider,
  subscribedEvents,
  headers,
  body,
  webhookRequest,
  workspaceId,
  webhookRequestId,
}: {
  provider: WebhookProvider | null;
  subscribedEvents: string[];
  headers: Record<string, string>;
  body: Record<string, unknown>;
  webhookRequest: WebhookRequestResource;
  workspaceId: string;
  webhookRequestId: number;
}): Promise<
  Result<
    {
      skipReason: string | null;
      receivedEventValue: string | null;
    },
    Error
  >
> {
  if (!provider) {
    return new Ok({ skipReason: null, receivedEventValue: null });
  }

  const {
    eventCheck,
    event_blacklist: blacklist,
    events,
  } = WEBHOOK_PRESETS[provider];

  if (!eventCheck) {
    return new Ok({ skipReason: null, receivedEventValue: null });
  }

  const { type, field } = eventCheck;

  let receivedEventValue: string | null = null;
  switch (type) {
    case "headers":
      receivedEventValue = headers[field.toLowerCase()];
      break;
    case "body":
      const bodyField = body[field];
      receivedEventValue = isString(bodyField) ? bodyField : null;
      break;
    default:
      assertNever(type);
  }

  if (!receivedEventValue) {
    const errorMessage = `Unable to determine webhook event from ${type}.`;
    await webhookRequest.markAsFailed(errorMessage);
    logger.error(
      {
        workspaceId,
        webhookRequestId,
      },
      errorMessage
    );
    return new Err(new TriggerNonRetryableError(errorMessage));
  }

  if (blacklist && blacklist.includes(receivedEventValue)) {
    await webhookRequest.markAsProcessed();
    logger.info(
      {
        workspaceId,
        webhookRequestId,
        provider,
        eventValue: receivedEventValue,
      },
      "Webhook event is blacklisted, ignoring."
    );
    return new Ok({ skipReason: "blacklisted", receivedEventValue });
  }

  if (
    !events.map((e) => e.value).includes(receivedEventValue) ||
    !subscribedEvents.includes(receivedEventValue)
  ) {
    const errorMessage =
      "Webhook event not subscribed or not in preset. Potential cause: the events selection was manually modified on the service.";
    await webhookRequest.markAsFailed(errorMessage);
    logger.error(
      {
        workspaceId,
        webhookRequestId,
        eventValue: receivedEventValue,
      },
      errorMessage
    );
    return new Err(new TriggerNonRetryableError(errorMessage));
  }

  return new Ok({ skipReason: null, receivedEventValue });
}

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

  const {
    provider,
    secret,
    signatureHeader,
    signatureAlgorithm,
    subscribedEvents,
  } = webhookSource;

  // Validate webhook signature if secret is configured
  if (secret) {
    const signatureCheckResult = checkSignature({
      headerName: signatureHeader,
      algorithm: signatureAlgorithm,
      secret,
      headers,
      body,
      provider,
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
    provider,
    subscribedEvents,
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
        return TriggerResource.listByWebhookSourceViewId(auth, view.id);
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

  for (const trigger of triggers) {
    const {
      configuration: { event, filter },
    } = trigger;

    if (event && receivedEventValue && event !== receivedEventValue) {
      // Received event doesn't match the trigger's event, skip this trigger
      await webhookRequest.markRelatedTrigger({
        trigger,
        status: "not_matched",
      });
      continue;
    }

    /**
     * Check for workspace-level rate limits
     * - for fair use execution mode, check global rate limits
     * - for programmatic usage mode, check public API limits
     */
    let workspaceRateLimitErrorMessage: string | null = null;
    if (!trigger.executionMode || trigger.executionMode === "fair_use") {
      const globalRateLimitRes = await checkWebhookRequestForRateLimit(auth);
      if (globalRateLimitRes.isErr()) {
        workspaceRateLimitErrorMessage = globalRateLimitRes.error.message;
      }
    } else {
      const publicAPILimit = await hasReachedPublicAPILimits(auth, true);
      if (publicAPILimit) {
        workspaceRateLimitErrorMessage =
          "Workspace has reached its public API limits for the current billing period.";
      }
    }

    if (workspaceRateLimitErrorMessage !== null) {
      await webhookRequest.markRelatedTrigger({
        trigger,
        status: "rate_limited",
        errorMessage: workspaceRateLimitErrorMessage,
      });

      statsDClient.increment("webhook_workspace_rate_limit.hit.count", 1, [
        `provider:${provider}`,
        `workspace_id:${workspaceId}`,
      ]);

      logger.error(
        { workspaceId, webhookRequestId },
        workspaceRateLimitErrorMessage
      );

      return {
        success: false,
        message: workspaceRateLimitErrorMessage,
      };
    }

    const specificRateLimiterRes = await checkTriggerForExecutionPerDayLimit(
      auth,
      {
        trigger,
      }
    );

    if (specificRateLimiterRes.isErr()) {
      const errorMessage = specificRateLimiterRes.error.message;
      await webhookRequest.markRelatedTrigger({
        trigger,
        status: "rate_limited",
        errorMessage,
      });
      logger.warn(
        { workspaceId, webhookRequestId, triggerId: trigger.sId },
        errorMessage
      );

      statsDClient.increment("webhook_trigger_rate_limit.hit.count", 1, [
        `provider:${provider}`,
        `workspace_id:${workspaceId}`,
        `trigger_id:${trigger.sId}`,
      ]);
      continue;
    }

    if (!filter) {
      // No filter, add the trigger
      filteredTriggers.push(trigger);
      continue;
    }

    const tags = [
      `provider:${provider}`,
      `workspace_id:${workspaceId}`,
      `trigger_id:${trigger.sId}`,
    ];
    statsDClient.increment("webhook_filter.events_processed.count", 1, tags);

    const parsedFilterResult = parseMatcherExpression(filter);
    if (parsedFilterResult.isErr()) {
      logger.error(
        {
          triggerId: trigger.id,
          triggerName: trigger.name,
          filter,
          err: parsedFilterResult.error,
        },
        "Invalid filter expression in webhook trigger"
      );
      continue;
    }

    const payloadMatchesFilter = matchPayload(body, parsedFilterResult.value);
    if (payloadMatchesFilter) {
      statsDClient.increment("webhook_filter.events_passed.count", 1, tags);
      filteredTriggers.push(trigger);
    }
  }

  // If no triggers match after filtering, return early without launching workflows.
  if (filteredTriggers.length === 0) {
    await webhookRequest.markAsProcessed();
    return {
      success: true,
      message: "No triggers matched the event.",
    };
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
    async (trigger) => {
      // Get the trigger's user and create a new authenticator
      const user = await UserResource.fetchByModelId(trigger.editor);

      if (!user) {
        logger.error(
          {
            triggerId: trigger.sId,
          },
          "Trigger editor not found."
        );
        await webhookRequest.markRelatedTrigger({
          trigger,
          status: "workflow_start_failed",
        });
      } else {
        const auth = await Authenticator.fromUserIdAndWorkspaceId(
          user.sId,
          workspaceId
        );
        if (trigger.configuration.includePayload && !contentFragment) {
          throw new TriggerNonRetryableError(
            "One of the triggers requires the payload, but the contentFragment is missing. It should never happen as the content fragment is created if any of the triggers requires the payload."
          );
        }

        // Fire and forget
        const result = await launchAgentTriggerWorkflow({
          auth,
          trigger,
          contentFragment,
        });

        if (result.isErr()) {
          await webhookRequest.markRelatedTrigger({
            trigger,
            status: "workflow_start_failed",
          });
          logger.error(
            {
              triggerId: trigger.sId,
              error: result.error,
            },
            "Error launching agent trigger workflow."
          );
        } else {
          await webhookRequest.markRelatedTrigger({
            trigger,
            status: "workflow_start_succeeded",
          });
        }
      }
    },
    { concurrency: 10 }
  );

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
