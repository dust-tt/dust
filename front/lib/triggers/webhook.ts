import {
  isApiBlocked,
  isProgrammaticApiBlocked,
} from "@app/lib/api/credits/access_control";
import { checkProgrammaticUsageLimits } from "@app/lib/api/programmatic_usage/tracking";
import { FathomClient } from "@app/lib/api/triggers/built-in-webhooks/fathom/fathom_client";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { isGCSPreconditionFailedError } from "@app/lib/file_storage/types";
import { matchPayload, parseMatcherExpression } from "@app/lib/matcher";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import type { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WebhookSourcesViewResource } from "@app/lib/resources/webhook_sources_view_resource";
import type { RateLimitCheckResult } from "@app/lib/triggers/rate_limits";
import {
  checkTriggerForExecutionPerDayLimit,
  checkWebhookRequestForRateLimit,
} from "@app/lib/triggers/rate_limits";
import { statsDMetrics } from "@app/lib/utils/statsd";
import { verifySignature } from "@app/lib/webhook_source_server";
import logger from "@app/logger/logger";
import { launchTriggersWorkflows } from "@app/temporal/triggers/webhook_client";
import type {
  TriggerType,
  WebhookRequestTriggerStatus,
  WebhookTriggerType,
} from "@app/types/assistant/triggers";
import { isWebhookTrigger } from "@app/types/assistant/triggers";
import { isCreditPricedPlan } from "@app/types/plan";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  errorToString,
  normalizeError,
} from "@app/types/shared/utils/error_utils";
import { isString, removeNulls } from "@app/types/shared/utils/general";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import { WEBHOOK_PRESETS } from "@app/types/triggers/webhooks";

export interface GetWebhookRequestsResponseBody {
  requests: Array<{
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    errorMessage: string | null;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }>;
}

/**
 * To avoid storing sensitive information, only these headers are allowed to be stored in GCS.
 */
export const HEADERS_ALLOWED_LIST = [
  ...removeNulls(
    Object.values(WEBHOOK_PRESETS)
      .filter((preset) => preset.eventCheck?.type === "headers")
      .map((preset) => preset.eventCheck?.field.toLowerCase())
  ),
  // Headers used by Fathom.
  "webhook-id",
  "webhook-signature",
  "webhook-timestamp",
];

function checkSignature({
  headerName,
  algorithm,
  secret,
  headers,
  rawBody,
  provider,
}: {
  headerName: string | null;
  algorithm: "sha1" | "sha256" | "sha512" | null;
  secret: string;
  headers: Record<string, string>;
  rawBody: string;
  provider: WebhookProvider | null;
}): Result<
  void,
  Omit<DustError, "code"> & { code: "invalid_signature_error" }
> {
  if (provider === "fathom") {
    const verifyRes = FathomClient.verifyWebhook({
      secret,
      headers,
      body: rawBody,
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

  const isValid = verifySignature({
    signedContent: rawBody,
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

async function validateEventSubscription({
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

type WorkspaceBlock = {
  status: Extract<
    WebhookRequestTriggerStatus,
    "rate_limited" | "credits_exhausted"
  >;
  message: string;
};

type WorkspaceBlockCheckResult =
  | { blocked: false; block?: undefined }
  | { blocked: true; block: WorkspaceBlock };

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
}): Promise<WorkspaceBlockCheckResult> {
  let block: WorkspaceBlock | null = null;

  const plan = auth.subscription()?.plan;
  const owner = auth.getNonNullableWorkspace();

  // Credit-priced pool gate: applies to any execution mode. If the pool is
  // depleted, no downstream message can be posted, so reject early instead of
  // spinning up the trigger workflow only to fail in `checkMessagesLimit`.
  if (plan && isCreditPricedPlan(plan)) {
    if (owner.metronomeCustomerId && (await isApiBlocked(auth))) {
      block = {
        status: "credits_exhausted",
        message:
          "Your workspace has run out of credits. Please purchase more credits to continue.",
      };
    }

    // Programmatic monthly cap gate: if the cap is reached, reject early for
    // triggers charged to the workspace pool.
    if (
      !block &&
      owner.metronomeCustomerId &&
      trigger.executionMode === "workspace_pool" &&
      (await isProgrammaticApiBlocked(auth))
    ) {
      block = {
        status: "credits_exhausted",
        message:
          "Your workspace has reached its programmatic monthly spending cap. An admin can raise the cap in the workspace's usage settings.",
      };
    }
  }

  /**
   * Check for workspace-level rate limits
   * - user pool: check global rate limits
   * - workspace pool: check public API limits
   */
  if (!block) {
    switch (trigger.executionMode) {
      case "user_pool": {
        const { rateLimited, message } =
          await checkWebhookRequestForRateLimit(auth);
        if (rateLimited) {
          block = { status: "rate_limited", message };
        }
        break;
      }
      case "workspace_pool": {
        // The legacy programmatic-credit gate applies to legacy plans only.
        // Credit-priced plans are already gated above by the pool check.
        if (!plan || !isCreditPricedPlan(plan)) {
          const limitsResult = await checkProgrammaticUsageLimits(auth);
          if (limitsResult.isErr()) {
            block = {
              status: "rate_limited",
              message: limitsResult.error.message,
            };
          }
        }
        break;
      }
      default:
        assertNever(trigger.executionMode);
    }
  }

  if (block !== null) {
    statsDMetrics.increment("webhook_workspace_rate_limit.hit.count", 1, [
      `provider:${provider}`,
      `workspace_id:${workspaceId}`,
      `block_status:${block.status}`,
    ]);
    logger.error(
      {
        workspaceId,
        webhookRequestId,
        triggerId: trigger.sId,
        provider,
        blockStatus: block.status,
      },
      block.message
    );
    return { blocked: true, block };
  }

  return { blocked: false };
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
    statsDMetrics.increment("webhook_trigger_rate_limit.hit.count", 1, [
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
  statsDMetrics.increment("webhook_filter.events_processed.count", 1, tags);

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
    statsDMetrics.increment("webhook_filter.events_passed.count", 1, tags);
    return true;
  }

  return false;
}

async function filterTriggers(
  auth: Authenticator,
  {
    enabledWebhookTriggers,
    webhookSource,
    receivedEventValue,
    webhookRequest,
    body,
  }: {
    enabledWebhookTriggers: TriggerResource[];
    webhookSource: WebhookSourceResource;
    receivedEventValue: string | null;
    webhookRequest: WebhookRequestResource;
    body: Record<string, unknown>;
  }
): Promise<Result<WebhookTriggerType[], Error>> {
  const workspaceId = auth.getNonNullableWorkspace().sId;
  const { provider } = webhookSource;

  const triggers = enabledWebhookTriggers
    .map((t) => t.toJSON())
    // Filter here to avoid a lot of type checking later.
    .filter(isWebhookTrigger);

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
    const workspaceBlockResult = await checkWorkspaceRateLimit({
      auth,
      trigger,
      workspaceId,
      webhookRequestId: webhookRequest.id,
      provider,
    });
    if (workspaceBlockResult.blocked) {
      const { status, message } = workspaceBlockResult.block;
      await webhookRequest.markRelatedTrigger({
        trigger,
        status,
        errorMessage: message,
      });
      // If it's a workspace-level rate limit, return an error immediately.
      return new Err(new Error(message));
    }

    // Check 4: Trigger-specific rate limit.
    const triggerRateLimitResult = await checkTriggerRateLimit({
      auth,
      trigger,
      workspaceId,
      webhookRequestId: webhookRequest.id,
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

async function storePayloadInGCS(
  auth: Authenticator,
  {
    webhookSource,
    webhookRequest,
    headers,
    body,
    provider,
  }: {
    webhookSource: WebhookSourceResource;
    webhookRequest: WebhookRequestResource;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    provider: string;
  }
): Promise<void> {
  const content = JSON.stringify({
    headers,
    body,
  });

  const bucket = getWebhookRequestsBucket();

  const gcsPath = WebhookRequestResource.getGcsPath({
    workspaceId: auth.getNonNullableWorkspace().sId,
    webhookSourceModelId: webhookSource.id,
    webhookRequestModelId: webhookRequest.id,
  });

  try {
    // Webhook payloads are capped at 2MB and paths include the request id, so
    // use the small create-only upload helper instead of a resumable overwrite.
    await bucket.uploadSmallRawContentToBucketAsNewFile({
      content,
      contentType: "application/json",
      filePath: gcsPath,
    });
  } catch (error: unknown) {
    if (isGCSPreconditionFailedError(error)) {
      logger.info(
        {
          webhookRequestId: webhookRequest.id,
          error,
          gcsPath,
        },
        "Webhook request payload was already stored in GCS"
      );

      statsDMetrics.increment("webhook_gcs_precondition.count", 1, [
        `provider:${provider}`,
        `workspace_id:${auth.getNonNullableWorkspace().sId}`,
      ]);

      return;
    }

    // Log the error, but do not throw, as we want to continue processing the webhook.
    // The webhook request will be marked as failed later in the processing if needed.
    logger.error(
      {
        webhookRequestId: webhookRequest.id,
        error,
        gcsPath,
      },
      "Failed to store webhook request"
    );

    statsDMetrics.increment("webhook_error.count", 1, [
      `provider:${provider}`,
      `workspace_id:${auth.getNonNullableWorkspace().sId}`,
    ]);
  }

  return;
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
        webhookSourceModelId: webhookRequest.webhookSourceId,
        webhookRequestModelId: webhookRequest.id,
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
    rawBody,
  }: {
    webhookSource: WebhookSourceResource;
    webhookRequest: WebhookRequestResource;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    rawBody: string;
  }
): Promise<Result<{ triggerIds: string[] }, Error>> {
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
      rawBody,
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
    return new Ok({ triggerIds: [] }); // We consider event validation errors as non-retryable.
  }

  const { skipReason, receivedEventValue } = eventValidationResult.value;
  if (skipReason) {
    return new Ok({ triggerIds: [] });
  }

  // Fetch all webhook source views for this webhook source.
  // We use the internal method that skips space permission filtering because:
  // 1. The webhook request was already authorized via the URL secret.
  // 2. Webhook source views in private spaces should still trigger their associated agents.
  const views =
    await WebhookSourcesViewResource.listByWebhookSourceForInternalProcessing(
      auth,
      webhookSource.id
    );

  // Fetch all triggers based on the webhook source id and flatten the result.
  const webhookTriggers = await TriggerResource.listByWebhookSourceViewIds(
    auth,
    views.map((view) => view.id)
  );
  const enabledWebhookTriggers = webhookTriggers.filter(
    ({ status }) => status === "enabled"
  );

  if (
    enabledWebhookTriggers.some(
      (t) =>
        "includePayload" in t.configuration && t.configuration.includePayload
    )
  ) {
    await storePayloadInGCS(auth, {
      webhookSource,
      webhookRequest,
      headers,
      body,
      provider: webhookSource.provider ?? "custom",
    });
  }

  const filteredTriggersResult = await filterTriggers(auth, {
    enabledWebhookTriggers,
    webhookSource,
    receivedEventValue,
    webhookRequest,
    body,
  });

  if (filteredTriggersResult.isErr()) {
    await webhookRequest.markAsFailed(filteredTriggersResult.error.message);
    localLogger.error(filteredTriggersResult.error.message);
    return new Ok({ triggerIds: [] }); // We consider filtering errors as non-retryable.
  }

  const filteredTriggers = filteredTriggersResult.value;
  if (filteredTriggers.length === 0) {
    localLogger.info("No triggers matched the webhook request.");
    await webhookRequest.markAsProcessed();
    return new Ok({ triggerIds: [] });
  }

  const launchResult = await launchTriggersWorkflows(auth, {
    filteredTriggers,
    webhookRequest,
  });

  if (launchResult.isErr()) {
    await webhookRequest.markAsFailed(launchResult.error.message);
    localLogger.error(launchResult.error.message);
    return new Ok({ triggerIds: [] }); // We consider launch errors as non-retryable.
  }

  await webhookRequest.markAsProcessed();

  return new Ok({ triggerIds: filteredTriggers.map((t) => t.sId) });
}

export async function fetchRecentWebhookRequestTriggersWithPayload(
  auth: Authenticator,
  {
    trigger,
    limit = 15,
    status,
  }: {
    trigger: TriggerType;
    limit?: number;
    status?: WebhookRequestTriggerStatus;
  }
): Promise<
  {
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    errorMessage: string | null;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }[]
> {
  const workspace = auth.getNonNullableWorkspace();
  const webhookRequestTriggers = await WebhookRequestResource.listForTriggerId(
    auth,
    {
      triggerId: trigger.id,
      limit,
      status,
    }
  );
  const shouldFetchPayload =
    isWebhookTrigger(trigger) && trigger.configuration.includePayload;

  // Fetch payloads from GCS for each request when the trigger is configured to keep them.
  const bucket = shouldFetchPayload ? getWebhookRequestsBucket() : null;
  const requests = await Promise.all(
    webhookRequestTriggers.map(async (wrt) => {
      let payload:
        | {
            headers?: Record<string, string | string[]>;
            body?: unknown;
          }
        | undefined;
      const requestCanHavePayload =
        wrt.status === "workflow_start_succeeded" ||
        wrt.status === "workflow_start_failed";

      if (bucket && requestCanHavePayload) {
        const gcsPath = WebhookRequestResource.getGcsPath({
          workspaceId: workspace.sId,
          webhookSourceModelId: wrt.webhookRequest.webhookSourceId,
          webhookRequestModelId: wrt.webhookRequest.id,
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
      }

      return {
        id: wrt.webhookRequest.id,
        timestamp: wrt.webhookRequest.createdAt.getTime(),
        status: wrt.status,
        errorMessage: wrt.errorMessage,
        payload,
      };
    })
  );

  return requests;
}
