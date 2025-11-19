import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { hasReachedPublicAPILimits } from "@app/lib/api/programmatic_usage_tracking";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { matchPayload, parseMatcherExpression } from "@app/lib/matcher";
import { WebhookRequestModel } from "@app/lib/models/assistant/triggers/webhook_request";
import type { WebhookRequestTriggerStatus } from "@app/lib/models/assistant/triggers/webhook_request_trigger";
import { WebhookRequestTriggerModel } from "@app/lib/models/assistant/triggers/webhook_request_trigger";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { FathomClient } from "@app/lib/triggers/built-in-webhooks/fathom/fathom_client";
import { checkTriggerForExecutionPerDayLimit } from "@app/lib/triggers/common";
import { launchAgentTriggerWorkflow } from "@app/lib/triggers/temporal/common/client";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import { verifySignature } from "@app/lib/webhookSource";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import type { ContentFragmentInputWithFileIdType, Result } from "@app/types";
import { assertNever, Err, isString, normalizeError, Ok } from "@app/types";
import type {
  TriggerType,
  WebhookTriggerType,
} from "@app/types/assistant/triggers";
import { isWebhookTrigger } from "@app/types/assistant/triggers";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

const WORKSPACE_MESSAGE_LIMIT_MULTIPLIER = 0.5; // 50% of workspace message limit

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

  if (!WEBHOOK_PRESETS[provider]) {
    const errorMessage = `No webhook preset found for provider: ${provider}.`;
    await webhookRequest.markAsFailed(errorMessage);
    logger.error(
      {
        workspaceId,
        webhookRequestId,
      },
      errorMessage
    );
    return new Err(normalizeError(errorMessage));
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
    return new Err(normalizeError(errorMessage));
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
    return new Err(normalizeError(errorMessage));
  }

  return new Ok({ skipReason: null, receivedEventValue });
}

async function validateWebhookSignature({
  webhookSource,
  headers,
  body,
  webhookRequest,
}: {
  webhookSource: WebhookSourceResource;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  webhookRequest: WebhookRequestResource;
}): Promise<Result<void, Error>> {
  const { provider, secret, signatureHeader, signatureAlgorithm } =
    webhookSource;

  if (!secret) {
    return new Ok(undefined);
  }

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
    logger.error(
      {
        workspaceId: webhookSource.workspaceId,
        webhookRequestId: webhookRequest.id,
      },
      errorMessage
    );
    return new Err(signatureCheckResult.error);
  }

  return new Ok(undefined);
}

async function fetchAndFilterTriggers({
  auth,
  webhookSource,
  webhookRequest,
  receivedEventValue,
  body,
}: {
  auth: Authenticator;
  webhookSource: WebhookSourceResource;
  webhookRequest: WebhookRequestResource;
  receivedEventValue: string | null;
  body: Record<string, unknown>;
}): Promise<Array<WebhookTriggerType>> {
  const { provider } = webhookSource;
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const webhookRequestId = webhookRequest.id;

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

  const filteredTriggers = [];

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

      // Return empty array since we hit workspace rate limit
      return [];
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

  return filteredTriggers;
}

async function createWebhookContentFragment({
  auth,
  webhookSource,
  body,
}: {
  auth: Authenticator;
  webhookSource: WebhookSourceResource;
  body: Record<string, unknown>;
}): Promise<Result<ContentFragmentInputWithFileIdType, Error>> {
  const contentFragmentRes = await toFileContentFragment(auth, {
    contentFragment: {
      contentType: "application/json",
      content: JSON.stringify(body),
      title: `Webhook body (source id: ${webhookSource.id}, date: ${new Date().toISOString()})`,
    },
    fileName: `webhook_body_${webhookSource.id}_${Date.now()}.json`,
  });

  if (contentFragmentRes.isErr()) {
    return new Err(
      new Error("Error creating file content fragment from webhook request.")
    );
  }

  return contentFragmentRes;
}

async function launchTriggersWorkflows({
  triggers,
  webhookRequest,
  contentFragment,
  workspaceId,
}: {
  triggers: Array<WebhookTriggerType>;
  webhookRequest: WebhookRequestResource;
  contentFragment: ContentFragmentInputWithFileIdType | undefined;
  workspaceId: string;
}): Promise<void> {
  await concurrentExecutor(
    triggers,
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
          return new Err(
            normalizeError(
              "One of the triggers requires the payload, but the contentFragment is missing. It should never happen as the content fragment is created if any of the triggers requires the payload."
            )
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
}

export function checkSignature({
  headerName,
  algorithm,
  secret,
  headers,
  body,
  provider,
}: {
  headerName: string | null;
  algorithm: "sha1" | "sha256" | "sha512" | null;
  secret: string;
  headers: Record<string, string>;
  body: unknown;
  provider: WebhookProvider | null;
}): Result<
  void,
  Omit<DustError, "code"> & { code: "invalid_signature_error" }
> {
  if (provider === "fathom") {
    const verifyRes = FathomClient.verifyWebhook({
      secret,
      headers,
      body: JSON.stringify(body),
    });

    if (verifyRes.isErr()) {
      return new Err({
        name: "dust_error",
        code: "invalid_signature_error",
        message: `Invalid Fathom webhook signature: ${verifyRes.error.message}`,
      });
    }

    return new Ok(undefined);
  }

  if (!headerName || !algorithm) {
    return new Err({
      name: "dust_error",
      code: "invalid_signature_error",
      message:
        "Missing headerName or algorithm for custom webhook verification",
    });
  }

  const signature = headers[headerName.toLowerCase()] as string;

  if (!signature) {
    return new Err({
      name: "dust_error",
      code: "invalid_signature_error",
      message: `Missing signature header: ${headerName}`,
    });
  }

  const stringifiedBody = JSON.stringify(body);

  const isValid = verifySignature({
    signedContent: stringifiedBody,
    secret: secret,
    signature,
    algorithm,
  });

  if (!isValid) {
    return new Err({
      name: "dust_error",
      code: "invalid_signature_error",
      message: "Invalid webhook signature.",
    });
  }

  return new Ok(undefined);
}

export async function checkWebhookRequestForRateLimit(
  auth: Authenticator
): Promise<
  Result<
    void,
    Omit<DustError, "code"> & {
      code: "rate_limit_error";
    }
  >
> {
  const plan = auth.getNonNullablePlan();
  const workspace = auth.getNonNullableWorkspace();
  const { maxMessages, maxMessagesTimeframe } = plan.limits.assistant;

  // Rate limiting: 50% of workspace message limit
  if (maxMessages !== -1) {
    const activeSeats = await countActiveSeatsInWorkspaceCached(workspace.sId);
    const webhookLimit = Math.ceil(
      maxMessages * activeSeats * WORKSPACE_MESSAGE_LIMIT_MULTIPLIER
    ); // 50% of workspace message limit

    const remaining = await rateLimiter({
      key: `workspace:${workspace.sId}:webhook_triggers:${maxMessagesTimeframe}`,
      maxPerTimeframe: webhookLimit,
      timeframeSeconds: getTimeframeSecondsFromLiteral(maxMessagesTimeframe),
      logger: logger,
    });

    if (remaining <= 0) {
      return new Err({
        name: "dust_error",
        code: "rate_limit_error",
        message:
          "Webhook triggers rate limit exceeded. " +
          `You can trigger up to ${webhookLimit} webhooks per ` +
          (maxMessagesTimeframe === "day" ? "day" : "month"),
      });
    }
    return new Ok(undefined);
  }

  return new Ok(undefined);
}

export async function processWebhookRequest({
  auth,
  webhookRequest,
  webhookSource,
  headers,
  body,
}: {
  auth: Authenticator;
  webhookRequest: WebhookRequestResource;
  webhookSource: WebhookSourceResource;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}): Promise<Result<string, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const webhookRequestId = webhookRequest.id;

  // Validate webhook signature if secret is configured
  const signatureValidationResult = await validateWebhookSignature({
    webhookSource,
    headers,
    body,
    webhookRequest,
  });

  if (signatureValidationResult.isErr()) {
    return signatureValidationResult;
  }

  // Validate event subscription
  const eventValidationResult = await validateEventSubscription({
    provider: webhookSource.provider,
    subscribedEvents: webhookSource.subscribedEvents,
    headers,
    body,
    webhookRequest,
    workspaceId,
    webhookRequestId,
  });

  if (eventValidationResult.isErr()) {
    return eventValidationResult;
  }

  const { skipReason, receivedEventValue } = eventValidationResult.value;

  if (skipReason) {
    return new Ok(`Skipped, reason: ${skipReason}`);
  }

  // Fetch and filter triggers
  const filteredTriggers = await fetchAndFilterTriggers({
    auth,
    webhookSource,
    webhookRequest,
    receivedEventValue,
    body,
  });

  // If no triggers match after filtering, return early without launching workflows.
  if (filteredTriggers.length === 0) {
    await webhookRequest.markAsProcessed();
    return new Ok("No triggers matched the event.");
  }

  // Check if any of the triggers requires the payload and create content fragment if needed
  const requiresPayload = filteredTriggers.some(
    (t) => t.configuration.includePayload
  );

  let contentFragment: ContentFragmentInputWithFileIdType | undefined;
  if (requiresPayload) {
    const contentFragmentRes = await createWebhookContentFragment({
      auth,
      webhookSource,
      body,
    });

    if (contentFragmentRes.isErr()) {
      const errorMessage = contentFragmentRes.error.message;
      await webhookRequest.markAsFailed(errorMessage);
      logger.error({ workspaceId, webhookRequestId }, errorMessage);
      return new Err(normalizeError(errorMessage));
    }

    contentFragment = contentFragmentRes.value;
  }

  // Launch all the triggers' workflows concurrently
  await launchTriggersWorkflows({
    triggers: filteredTriggers,
    webhookRequest,
    contentFragment,
    workspaceId,
  });

  // Finally, mark the webhook request as processed
  await webhookRequest.markAsProcessed();

  return new Ok("Webhook request processed successfully.");
}

export async function fetchRecentWebhookRequestTriggersWithPayload(
  auth: Authenticator,
  {
    trigger,
    limit = 15,
  }: {
    trigger: TriggerType;
    limit?: number;
  }
): Promise<
  {
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }[]
> {
  const workspace = auth.getNonNullableWorkspace();
  const webhookRequestTriggers = await WebhookRequestTriggerModel.findAll({
    where: {
      workspaceId: workspace.id,
      triggerId: trigger.id,
    },
    include: [
      {
        model: WebhookRequestModel,
        as: "webhookRequest",
        required: true,
        attributes: ["id", "createdAt", "webhookSourceId"],
      },
    ],
    order: [["createdAt", "DESC"]],
    limit,
  });

  // Fetch payloads from GCS for each request
  const bucket = getWebhookRequestsBucket();
  const requests = await Promise.all(
    webhookRequestTriggers.map(async (wrt) => {
      let payload:
        | {
            headers?: Record<string, string | string[]>;
            body?: unknown;
          }
        | undefined;

      const gcsPath = WebhookRequestResource.getGcsPath({
        workspaceId: workspace.sId,
        webhookSourceId: wrt.webhookRequest.webhookSourceId,
        webRequestId: wrt.webhookRequest.id,
      });

      try {
        const file = bucket.file(gcsPath);
        const [content] = await file.download();
        if (content) {
          payload = JSON.parse(content.toString());
        }
      } catch (error) {
        logger.warn(
          {
            webhookRequestId: wrt.webhookRequest.id,
            error: error instanceof Error ? error.message : String(error),
          },
          "Failed to fetch webhook request payload from GCS"
        );
        // Continue without payload if GCS fetch fails
      }

      return {
        id: wrt.webhookRequest.id,
        timestamp: wrt.webhookRequest.createdAt.getTime(),
        status: wrt.status,
        payload,
      };
    })
  );

  return requests;
}
