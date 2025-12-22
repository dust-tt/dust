import type { PostWebhookTriggerResponseType } from "@dust-tt/client";
import type { NextApiResponse } from "next";

import { Authenticator } from "@app/lib/auth";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  HEADERS_ALLOWED_LIST,
  processWebhookRequest,
  storePayloadInGCS,
} from "@app/lib/triggers/webhook";
import { statsDClient } from "@app/logger/statsDClient";
import type { NextApiRequestWithContext } from "@app/logger/withlogging";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

/**
 * @swagger
 * /api/v1/w/{wId}/triggers/hooks/{webhookSourceId}:
 *   post:
 *     summary: Receive external webhook to trigger flows
 *     description: Skeleton endpoint that verifies workspace and webhook source and logs receipt.
 *     tags:
 *       - Triggers
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: wId
 *         required: true
 *         description: Workspace ID
 *         schema:
 *           type: string
 *       - in: path
 *         name: webhookSourceId
 *         required: true
 *         description: Webhook source ID
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Webhook received
 *       400:
 *         description: Invalid request
 *       404:
 *         description: Workspace or webhook source not found
 *       405:
 *         description: Method not allowed
 */

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "2mb",
    },
  },
};

async function handler(
  req: NextApiRequestWithContext,

  res: NextApiResponse<WithAPIErrorResponse<PostWebhookTriggerResponseType>>
): Promise<void> {
  const { method, body, headers, query } = req;

  if (method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  const contentType = headers["content-type"];
  if (!contentType || !contentType.includes("application/json")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Content-Type must be application/json.",
      },
    });
  }

  const { wId, webhookSourceId, webhookSourceUrlSecret } = query;

  if (
    typeof wId !== "string" ||
    typeof webhookSourceId !== "string" ||
    typeof webhookSourceUrlSecret !== "string"
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid route parameters: expected string wId, webhookSourceId and webhookSourceUrlSecret.",
      },
    });
  }

  const workspace = await WorkspaceResource.fetchById(wId);
  if (!workspace) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: `Workspace ${wId} not found.`,
      },
    });
  }

  const auth = await Authenticator.internalBuilderForWorkspace(wId);

  const webhookSource = await WebhookSourceResource.fetchById(
    auth,
    webhookSourceId
  );

  if (!webhookSource) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "webhook_source_not_found",
        message: `Webhook source ${webhookSourceId} not found in workspace ${wId}.`,
      },
    });
  }

  // Validate webhook url secret
  if (webhookSourceUrlSecret !== webhookSource.urlSecret) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "webhook_source_auth_error",
        message: "Invalid webhook path.",
      },
    });
  }

  const provider = webhookSource.provider ?? "custom";

  statsDClient.increment("webhook_request.count", 1, [
    `provider:${provider}`,
    `workspace_id:${workspace.sId}`,
  ]);

  const webhookRequest = await WebhookRequestResource.makeNew({
    workspaceId: auth.getNonNullableWorkspace().id,
    webhookSourceId: webhookSource.id,
    status: "received",
  });

  const filteredHeaders: Record<string, string> = Object.fromEntries(
    Object.entries(headers).filter(
      ([key]) =>
        (HEADERS_ALLOWED_LIST.includes(key.toLowerCase()) ||
          webhookSource.signatureHeader?.toLowerCase() === key.toLowerCase()) &&
        isString(headers[key])
    ) as [string, string][] // Type assertion to satisfy TypeScript, we've already filtered to strings
  );

  await storePayloadInGCS(auth, {
    webhookSource,
    webhookRequest,
    headers: filteredHeaders,
    body,
  });

  const result = await processWebhookRequest(auth, {
    webhookSource: webhookSource,
    webhookRequest,
    headers: filteredHeaders,
    body,
  });

  if (result.isErr()) {
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "webhook_processing_error",
        message: result.error.message,
      },
    });
  }

  return res.status(200).json({ success: true });
}

export default withLogging(handler);
