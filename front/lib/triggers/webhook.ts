import type { IncomingHttpHeaders } from "node:http";

import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { getWebhookRequestsBucket } from "@app/lib/file_storage";
import { WebhookRequestModel } from "@app/lib/models/assistant/triggers/webhook_request";
import type { WebhookRequestTriggerStatus } from "@app/lib/models/assistant/triggers/webhook_request_trigger";
import { WebhookRequestTriggerModel } from "@app/lib/models/assistant/triggers/webhook_request_trigger";
import { countActiveSeatsInWorkspaceCached } from "@app/lib/plans/usage/seats";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { launchAgentTriggerWebhookWorkflow } from "@app/lib/triggers/temporal/webhook/client";
import {
  getTimeframeSecondsFromLiteral,
  rateLimiter,
} from "@app/lib/utils/rate_limiter";
import { verifySignature } from "@app/lib/webhookSource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { Err, errorToString, Ok } from "@app/types";
import type { TriggerType } from "@app/types/assistant/triggers";
import type { WebhookSourceForAdminType } from "@app/types/triggers/webhooks";

const WORKSPACE_MESSAGE_LIMIT_MULTIPLIER = 0.1; // 10% of workspace message limit
const HEADERS_ALLOWED_LIST = ["x-github-event"]; // To avoid storing all headers in GCS, they might contain sensitive information

export const checkSignature = ({
  headerName,
  algorithm,
  secret,
  headers,
  body,
}: {
  headerName: string;
  algorithm: "sha1" | "sha256" | "sha512";
  secret: string;
  headers: Record<string, string>;
  body: any;
}): Result<
  void,
  Omit<DustError, "code"> & { code: "invalid_signature_error" }
> => {
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
};

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
    webhookSource: WebhookSourceForAdminType;
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
    const gcsPath = WebhookRequestResource.getGcsPath({
      workspaceId: auth.getNonNullableWorkspace().sId,
      webhookSourceId: webhookSource.id,
      webRequestId: webhookRequest.id,
    });

    // Store in GCS
    await bucket.uploadRawContentToBucket({
      content,
      contentType: "application/json",
      filePath: gcsPath,
    });

    await launchAgentTriggerWebhookWorkflow({
      auth,
      webhookRequest,
    });
  } catch (error) {
    await webhookRequest.markAsFailed(errorToString(error));
    return new Err(error as Error);
  }
};

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
  Array<{
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }>
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

      try {
        const gcsPath = WebhookRequestResource.getGcsPath({
          workspaceId: workspace.sId,
          webhookSourceId: wrt.webhookRequest.webhookSourceId,
          webRequestId: wrt.webhookRequest.id,
        });

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
