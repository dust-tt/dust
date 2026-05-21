import config from "@app/lib/api/config";
import {
  getClientIpFromHeaders,
  isWorkOSIpAddress,
  validateWorkOSWebhookEvent,
} from "@app/lib/api/workos/webhook_helpers";
import logger from "@app/logger/logger";
import { launchWorkOSEventsWorkflow } from "@app/temporal/workos_events_queue/client";
import { apiError } from "@front-api/middleware/utils";
import { Hono } from "hono";

const app = new Hono();

app.post("/", async (ctx) => {
  const webhookSecret = ctx.req.param("webhookSecret");
  if (typeof webhookSecret !== "string") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The webhookSecret query parameter is required.",
      },
    });
  }

  if (webhookSecret !== config.getWorkOSWebhookSecret()) {
    return apiError(ctx, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The webhookSecret query parameter is invalid.",
      },
    });
  }

  // Validate the client IP address. Hono does not surface the underlying Node
  // `req.socket.remoteAddress`, so we rely on the forwarded headers WorkOS
  // sends (which the Next handler also prioritized via `getClientIpFromHeaders`).
  const headers: Record<string, string | string[] | undefined> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const clientIp = getClientIpFromHeaders(headers);
  if (typeof clientIp !== "string") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not determine client IP address",
      },
    });
  }

  if (!isWorkOSIpAddress(clientIp)) {
    logger.error({ clientIp }, "Request not from WorkOS IP range");
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Request not from WorkOS IP range",
      },
    });
  }

  const sigHeader = ctx.req.header("workos-signature");
  if (typeof sigHeader !== "string") {
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The workos-signature header is required.",
      },
    });
  }

  const payload = await ctx.req.json();
  const result = await validateWorkOSWebhookEvent(payload, {
    signatureHeader: sigHeader,
  });
  if (result.isErr()) {
    logger.error({ error: result.error }, "Invalid WorkOS webhook event");
    return apiError(ctx, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  const workflowId = await launchWorkOSEventsWorkflow({
    eventPayload: result.value,
  });
  if (workflowId.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: workflowId.error.message,
      },
    });
  }

  return ctx.body(null, 200);
});

export default app;
