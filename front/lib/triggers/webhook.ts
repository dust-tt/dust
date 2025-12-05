import { toFileContentFragment } from "@app/lib/api/assistant/conversation/content_fragment";
import { hasReachedProgrammaticUsageLimits } from "@app/lib/api/programmatic_usage_tracking";
import { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { matchPayload, parseMatcherExpression } from "@app/lib/matcher";
import { WebhookRequestModel } from "@app/lib/models/agent/triggers/webhook_request";
import type { WebhookRequestTriggerStatus } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { WebhookRequestTriggerModel } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { UserResource } from "@app/lib/resources/user_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import { FathomClient } from "@app/lib/triggers/built-in-webhooks/fathom/fathom_client";
import type { RateLimitCheckResult } from "@app/lib/triggers/rate_limits";
import {
  checkTriggerForExecutionPerDayLimit,
  checkWebhookRequestForRateLimit,
} from "@app/lib/triggers/rate_limits";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { verifySignature } from "@app/lib/webhookSource";
import logger from "@app/logger/logger";
import { statsDClient } from "@app/logger/statsDClient";
import { launchAgentTriggerWorkflow } from "@app/temporal/triggers/common/client";
import type { ContentFragmentInputWithFileIdType, Result } from "@app/types";
import {
  assertNever,
  Err,
  errorToString,
  isString,
  normalizeError,
  Ok,
  removeNulls,
} from "@app/types";
import type {
  TriggerType,
  WebhookTriggerType,
} from "@app/types/assistant/triggers";
import { isWebhookTrigger } from "@app/types/assistant/triggers";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

/**
 * To avoid storing sensitive information, only these headers are allowed to be stored in GCS.
 */
export const HEADERS_ALLOWED_LIST = [
  ...removeNulls(
    Object.values(WEBHOOK_PRESETS)
      .filter((preset) => preset.eventCheck?.type === "headers")
      .map((preset) => preset.eventCheck?.field.toLowerCase())
  ),
  // Header used by Fathom.
  "webhook-signature",
];

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

export async function validateEventSubscription({
  webhookSource,
  headers,
  body,
  webhookRequest,
  workspaceId,
  webhookRequestId,
}: {
  webhookSource: {
    provider: WebhookProvider | null;
    subscribedEvents: string[];
  };
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
  const { provider, subscribedEvents } = webhookSource;

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
    return new Err(new Error(errorMessage));
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
    return new Err(new Error(errorMessage));
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
    return new Err(new Error(errorMessage));
  }

  return new Ok({ skipReason: null, receivedEventValue });
}

async function checkWorkspaceRateLimit({
  auth,
  trigger,
  workspaceId,
  webhookRequestId,
  provider,
}: {
  auth: Authenticator;
  trigger: WebhookTriggerType;
  workspaceId: string;
  webhookRequestId: number;
  provider: WebhookProvider | null;
}): Promise<RateLimitCheckResult> {
  let errorMessage: string | null = null;

  /**
   * Check for workspace-level rate limits
   * - for fair use execution mode, check global rate limits
   * - for programmatic usage mode, check public API limits
   */
  if (!trigger.executionMode || trigger.executionMode === "fair_use") {
    const { rateLimited, message } =
      await checkWebhookRequestForRateLimit(auth);
    if (rateLimited) {
      errorMessage = message;
    }
  } else {
    if (await hasReachedProgrammaticUsageLimits(auth)) {
      errorMessage =
        "Workspace has reached its public API limits for the current billing period.";
    }
  }

  if (errorMessage !== null) {
    statsDClient.increment("webhook_workspace_rate_limit.hit.count", 1, [
      `provider:${provider}`,
      `workspace_id:${workspaceId}`,
    ]);
    logger.error(
      {
        workspaceId,
        webhookRequestId,
        triggerId: trigger.sId,
        provider,
      },
      errorMessage
    );
    return { rateLimited: true, message: errorMessage };
  }

  return { rateLimited: false };
}

async function checkTriggerRateLimit({
  auth,
  trigger,
  workspaceId,
  webhookRequestId,
  provider,
}: {
  auth: Authenticator;
  trigger: WebhookTriggerType;
  workspaceId: string;
  webhookRequestId: number;
  provider: WebhookProvider | null;
}): Promise<RateLimitCheckResult> {
  const result = await checkTriggerForExecutionPerDayLimit(auth, { trigger });

  if (result.rateLimited) {
    logger.warn(
      { workspaceId, webhookRequestId, triggerId: trigger.sId },
      result.message
    );
    statsDClient.increment("webhook_trigger_rate_limit.hit.count", 1, [
      `provider:${provider}`,
      `workspace_id:${workspaceId}`,
      `trigger_id:${trigger.sId}`,
    ]);
  }

  return result;
}

/**
 * Checks if the webhook payload matches the trigger's filter expression.
 * Returns true if it matches or if there is no filter.
 */
function matchesPayloadFilter({
  trigger,
  body,
  provider,
  workspaceId,
}: {
  trigger: WebhookTriggerType;
  body: Record<string, unknown>;
  provider: WebhookProvider | null;
  workspaceId: string;
}): boolean {
  const { filter } = trigger.configuration;

  if (!filter) {
    return true;
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
    return false;
  }

  const payloadMatchesFilter = matchPayload(body, parsedFilterResult.value);
  if (payloadMatchesFilter) {
    statsDClient.increment("webhook_filter.events_passed.count", 1, tags);
    return true;
  }

  return false;
}

export async function filterTriggers({
  auth,
  webhookSource,
  receivedEventValue,
  webhookRequest,
  body,
}: {
  auth: Authenticator;
  webhookSource: { id: number; provider: WebhookProvider | null };
  receivedEventValue: string | null;
  webhookRequest: WebhookRequestResource;
  body: Record<string, unknown>;
}): Promise<Result<WebhookTriggerType[], Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const webhookRequestId = webhookRequest.id;
  const { provider } = webhookSource;
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
    const { event } = trigger.configuration;

    // Check 1: Event matching.
    if (event && receivedEventValue && event !== receivedEventValue) {
      await webhookRequest.markRelatedTrigger({
        trigger,
        status: "not_matched",
      });
      continue;
    }

    // Check 2: Payload filter.
    const payloadMatches = matchesPayloadFilter({
      trigger,
      body,
      provider,
      workspaceId,
    });
    if (!payloadMatches) {
      await webhookRequest.markRelatedTrigger({
        trigger,
        status: "not_matched",
      });
      continue;
    }

    // Check 3: Workspace-level rate limit.
    const workspaceRateLimitResult = await checkWorkspaceRateLimit({
      auth,
      trigger,
      workspaceId,
      webhookRequestId,
      provider,
    });
    if (workspaceRateLimitResult.rateLimited) {
      await webhookRequest.markRelatedTrigger({
        trigger,
        status: "rate_limited",
        errorMessage: workspaceRateLimitResult.message,
      });
      // If it's a workspace-level rate limit, return an error immediately.
      return new Err(new Error(workspaceRateLimitResult.message));
    }

    // Check 4: Trigger-specific rate limit.
    const triggerRateLimitResult = await checkTriggerRateLimit({
      auth,
      trigger,
      workspaceId,
      webhookRequestId,
      provider,
    });
    if (triggerRateLimitResult.rateLimited) {
      await webhookRequest.markRelatedTrigger({
        trigger,
        status: "rate_limited",
        errorMessage: triggerRateLimitResult.message,
      });
      continue;
    }

    filteredTriggers.push(trigger);
  }

  return new Ok(filteredTriggers);
}

export async function launchTriggersWorkflows({
  auth,
  filteredTriggers,
  webhookSource,
  body,
  webhookRequest,
}: {
  auth: Authenticator;
  filteredTriggers: WebhookTriggerType[];
  webhookSource: { id: number };
  body: Record<string, unknown>;
  webhookRequest: WebhookRequestResource;
}): Promise<Result<void, Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const webhookRequestId = webhookRequest.id;
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
      return new Err(new Error(errorMessage));
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
          const errorMessage =
            "One of the triggers requires the payload, but the contentFragment is missing. It should never happen as the content fragment is created if any of the triggers requires the payload.";
          logger.error(
            {
              triggerId: trigger.sId,
            },
            errorMessage
          );
          await webhookRequest.markRelatedTrigger({
            trigger,
            status: "workflow_start_failed",
          });
          return;
        }

        // Fire and forget
        const result = await launchAgentTriggerWorkflow({
          auth,
          trigger,
          contentFragment,
          webhookRequestId,
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

  return new Ok(undefined);
}

export async function storePayloadInGCS(
  auth: Authenticator,
  {
    webhookSource,
    webhookRequest,
    headers,
    body,
  }: {
    webhookSource: WebhookSourceResource;
    webhookRequest: WebhookRequestResource;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }
): Promise<Result<void, Error>> {
  const content = JSON.stringify({
    headers,
    body,
  });

  const bucket = getWebhookRequestsBucket();

  const gcsPath = WebhookRequestResource.getGcsPath({
    workspaceId: auth.getNonNullableWorkspace().sId,
    webhookSourceId: webhookSource.id,
    webRequestId: webhookRequest.id,
  });

  try {
    // Store in GCS
    await bucket.uploadRawContentToBucket({
      content,
      contentType: "application/json",
      filePath: gcsPath,
    });
  } catch (error: unknown) {
    const normalizedError = normalizeError(error);
    await webhookRequest.markAsFailed(normalizedError.message);
    logger.error(
      {
        webhookRequestId: webhookRequest.id,
        error,
      },
      "Failed to store webhook request"
    );
    return new Err(normalizedError);
  }

  return new Ok(undefined);
}

export async function getWebhookRequestPayloadFromGCS(
  auth: Authenticator,
  {
    webhookRequest,
  }: {
    webhookRequest: WebhookRequestResource;
  }
): Promise<
  Result<
    {
      headers: Record<string, string>;
      body: Record<string, unknown>;
    },
    Error
  >
> {
  try {
    const bucket = getWebhookRequestsBucket();
    const file = bucket.file(
      WebhookRequestResource.getGcsPath({
        workspaceId: auth.getNonNullableWorkspace().sId,
        webhookSourceId: webhookRequest.webhookSourceId,
        webRequestId: webhookRequest.id,
      })
    );
    const [content] = await file.download();
    const { headers: h, body: b } = JSON.parse(content.toString());

    return new Ok({ headers: h, body: b });
  } catch (error) {
    const errorAsString = errorToString(error);
    const errorMessage = "Unable to fetch webhook request content from GCS.";
    await webhookRequest.markAsFailed(errorMessage + " " + errorAsString);
    logger.error(
      {
        workspaceId: auth.getNonNullableWorkspace().sId,
        webhookRequestId: webhookRequest.id,
        error: errorAsString,
      },
      errorMessage
    );
    return new Err(normalizeError(errorMessage));
  }
}

export async function processWebhookRequest(
  auth: Authenticator,
  {
    webhookSource,
    webhookRequest,
    headers,
    body,
  }: {
    webhookSource: WebhookSourceResource;
    webhookRequest: WebhookRequestResource;
    headers: Record<string, string>;
    body: Record<string, unknown>;
  }
): Promise<Result<void, Error>> {
  const localLogger = logger.child({
    webhookRequestId: webhookRequest.id,
    webhookSourceId: webhookSource.id,
    workspaceId: auth.getNonNullableWorkspace().sId,
  });

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
      await webhookRequest.markAsFailed(signatureCheckResult.error.message);
      localLogger.error(signatureCheckResult.error.message);
      return signatureCheckResult;
    }
  }

  const eventValidationResult = await validateEventSubscription({
    webhookSource,
    headers,
    body,
    webhookRequest,
    workspaceId: auth.getNonNullableWorkspace().sId,
    webhookRequestId: webhookRequest.id,
  });

  if (eventValidationResult.isErr()) {
    await webhookRequest.markAsFailed(eventValidationResult.error.message);
    localLogger.error(eventValidationResult.error.message);
    return new Ok(undefined); // We consider event validation errors as non-retryable.
  }

  const { skipReason, receivedEventValue } = eventValidationResult.value;
  if (skipReason) {
    return new Ok(undefined);
  }

  const filteredTriggersResult = await filterTriggers({
    auth,
    webhookSource,
    receivedEventValue,
    webhookRequest,
    body,
  });

  if (filteredTriggersResult.isErr()) {
    await webhookRequest.markAsFailed(filteredTriggersResult.error.message);
    localLogger.error(filteredTriggersResult.error.message);
    return new Ok(undefined); // We consider filtering errors as non-retryable.
  }

  const filteredTriggers = filteredTriggersResult.value;
  if (filteredTriggers.length === 0) {
    await webhookRequest.markAsProcessed();
    return new Ok(undefined);
  }

  const launchResult = await launchTriggersWorkflows({
    auth,
    filteredTriggers,
    webhookSource,
    body,
    webhookRequest,
  });

  if (launchResult.isErr()) {
    await webhookRequest.markAsFailed(launchResult.error.message);
    localLogger.error(launchResult.error.message);
    return new Ok(undefined); // We consider launch errors as non-retryable.
  }

  await webhookRequest.markAsProcessed();

  return new Ok(undefined);
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
