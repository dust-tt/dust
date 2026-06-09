import { timingSafeEqual } from "node:crypto";

import { Authenticator } from "@app/lib/auth";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import {
  HEADERS_ALLOWED_LIST,
  processWebhookRequest,
} from "@app/lib/triggers/webhook";
import { getStatsDClient } from "@app/lib/utils/statsd";
import { isString } from "@app/types/shared/utils/general";
import type { PostWebhookTriggerResponseType } from "@dust-tt/client";
import { createHono } from "@front-api/lib/hono";
import type { HandlerResult } from "@front-api/middlewares/utils";
import { apiError } from "@front-api/middlewares/utils";
import { validate } from "@front-api/middlewares/validator";
import { z } from "zod";

const ParamsSchema = z.object({
  wId: z.string(),
  webhookSourceId: z.string(),
  webhookSourceUrlSecret: z.string(),
});

// 2mb body limit, matches the original `raw-body` `limit: "2mb"`.
const WEBHOOK_REQUEST_MAX_SIZE_BYTES = 2 * 1024 * 1024;

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
 */

// Mounted at /api/v1/w/:wId/triggers/hooks/:webhookSourceId/:webhookSourceUrlSecret.
// This route is mounted outside `publicApiAuth` because it uses its own
// authentication scheme based on the URL secret.
const app = createHono();

app.post(
  "/",
  validate("param", ParamsSchema),
  async (ctx): HandlerResult<PostWebhookTriggerResponseType> => {
    const contentType = ctx.req.header("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Content-Type must be application/json.",
        },
      });
    }

    // Read the raw body for signature verification (must match exactly what the
    // sender signed), then parse JSON for processing.
    const arrayBuffer = await ctx.req.arrayBuffer();
    if (arrayBuffer.byteLength > WEBHOOK_REQUEST_MAX_SIZE_BYTES) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Request body too large.",
        },
      });
    }
    const rawBody = Buffer.from(arrayBuffer).toString("utf8");
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "Invalid JSON body.",
        },
      });
    }

    const { wId, webhookSourceId, webhookSourceUrlSecret } =
      ctx.req.valid("param");

    const workspace = await WorkspaceResource.fetchById(wId);
    if (!workspace) {
      return apiError(ctx, {
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
      return apiError(ctx, {
        status_code: 404,
        api_error: {
          type: "webhook_source_not_found",
          message: `Webhook source ${webhookSourceId} not found in workspace ${wId}.`,
        },
      });
    }

    // Validate webhook url secret using constant-time comparison to prevent timing attacks.
    const a = Buffer.from(webhookSourceUrlSecret, "utf8");
    const b = Buffer.from(webhookSource.urlSecret, "utf8");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return apiError(ctx, {
        status_code: 401,
        api_error: {
          type: "webhook_source_auth_error",
          message: "Invalid webhook path.",
        },
      });
    }

    const provider = webhookSource.provider ?? "custom";

    getStatsDClient().increment("webhook_request.count", 1, [
      `provider:${provider}`,
      `workspace_id:${workspace.sId}`,
    ]);

    const webhookRequest = await WebhookRequestResource.makeNew({
      workspaceId: auth.getNonNullableWorkspace().id,
      webhookSourceId: webhookSource.id,
      status: "received",
    });

    const headers: Record<string, string | string[] | undefined> = {};
    ctx.req.raw.headers.forEach((value, key) => {
      headers[key] = value;
    });

    const filteredHeaders: Record<string, string> = Object.fromEntries(
      Object.entries(headers).filter(
        ([key]) =>
          (HEADERS_ALLOWED_LIST.includes(key.toLowerCase()) ||
            webhookSource.signatureHeader?.toLowerCase() ===
              key.toLowerCase()) &&
          isString(headers[key])
      ) as [string, string][] // Type assertion to satisfy TypeScript, we've already filtered to strings
    );

    const result = await processWebhookRequest(auth, {
      webhookSource,
      webhookRequest,
      headers: filteredHeaders,
      body,
      rawBody,
    });

    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: result.error.message,
        },
      });
    }

    return ctx.json({ success: true });
  }
);

export default app;
