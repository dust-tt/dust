import type { IncomingHttpHeaders } from "node:http";

import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, errorToString, Ok } from "@app/types";
import type { WebhookSourceType } from "@app/types/triggers/webhooks";

const WORKSPACE_MESSAGE_LIMIT_MULTIPLIER = 0.1; // 10% of workspace message limit
const HEADERS_ALLOWED_LIST = ["x-github-event"]; // To avoid storing all headers in GCS, they might contain sensitive information

export const checkWebhookRequestForRateLimit = async (
  auth: Authenticator
): Promise<
  Result<
    void,
    Omit<DustError, "code"> & {
      code: "rate_limit_error";
    }
  >
> => {
  const plan = auth.getNonNullablePlan();
  const workspace = auth.getNonNullableWorkspace();
  const { maxMessages, maxMessagesTimeframe } = plan.limits.assistant;

  // Rate limiting: 10% of workspace message limit
  if (maxMessages !== -1) {
    const activeSeats = await countActiveSeatsInWorkspaceCached(workspace.sId);
    const webhookLimit = Math.ceil(
      maxMessages * activeSeats * WORKSPACE_MESSAGE_LIMIT_MULTIPLIER
    ); // 10% of workspace message limit

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
        message: `Webhook triggers rate limit exceeded. You can trigger up to ${webhookLimit} webhooks per ${maxMessagesTimeframe}.`,
      });
    }
    return new Ok(undefined);
  } else {
    return new Ok(undefined);
  }
};

export const processWebhookRequest = async (
  auth: Authenticator,
  {
    webhookSource,
    headers,
    body,
  }: {
    webhookSource: WebhookSourceType;
    headers: IncomingHttpHeaders;
    body: any;
  }
) => {
  // Store on GCS as a file
  const content = JSON.stringify({
    headers: Object.fromEntries(
      Object.entries(headers).filter(([key]) =>
        HEADERS_ALLOWED_LIST.includes(key.toLowerCase())
      )
    ),
    body,
  });

  const bucket = getWebhookRequestsBucket();

  // Store in DB
  const webhookRequestRes = await WebhookRequestResource.makeNew({
    workspaceId: auth.getNonNullableWorkspace().id,
    webhookSourceId: webhookSource.id,
    status: "received",
  });

  // Failure when storing in DB
  if (webhookRequestRes.isErr()) {
    return webhookRequestRes;
  }

  const webhookRequest = webhookRequestRes.value;

  try {
    const gcsPath = webhookRequest.getGcsPath(auth);

    // Store in GCS
    await bucket.uploadRawContentToBucket({
      content,
      contentType: "application/json",
      filePath: gcsPath,
    });
  } catch (error) {
    await webhookRequest.markAsFailed(errorToString(error));
    return new Err(error as Error);
  }
};
