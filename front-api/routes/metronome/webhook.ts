import apiConfig from "@app/lib/api/config";
import { unwrapMetronomeWebhook } from "@app/lib/metronome/client";
import {
  getCustomerIdFromEvent,
  MetronomeWebhookEventSchema,
} from "@app/lib/metronome/webhook_events";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { launchMetronomeEventsWorkflow } from "@app/temporal/metronome_events_queue/client";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { apiError, type HandlerResult } from "@front-api/middlewares/utils";
import { Hono } from "hono";
import { z } from "zod";

type ResponseBody = {
  success: boolean;
  message?: string;
};

// Mounted at /api/metronome/webhook.
const app = new Hono();

app.get(
  "/",
  async (ctx): HandlerResult<ResponseBody> => ctx.json({ success: true })
);

app.post("/", async (ctx): HandlerResult<ResponseBody> => {
  // Read the raw body bytes once. Metronome's SDK signature verification
  // works on the exact string representation of the JSON body.
  const bodyString = await ctx.req.text();

  // Verify signature using the Metronome SDK.
  const webhookSecret = apiConfig.getMetronomeWebhookSecret();
  if (!webhookSecret) {
    logger.error(
      "[Metronome Webhook] METRONOME_WEBHOOK_SECRET is not configured"
    );
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Webhook secret not configured.",
      },
    });
  }

  // SDK expects Node-style headers (an object of name -> string).
  const headers: Record<string, string> = {};
  ctx.req.raw.headers.forEach((value, key) => {
    headers[key] = value;
  });

  let rawEvent: unknown;
  try {
    rawEvent = unwrapMetronomeWebhook(bodyString, headers, webhookSecret);
  } catch (err) {
    logger.error(
      { error: normalizeError(err) },
      "[Metronome Webhook] Signature verification failed"
    );
    return apiError(ctx, {
      status_code: 403,
      api_error: {
        type: "internal_server_error",
        message: "Invalid webhook signature.",
      },
    });
  }

  const parsedEvent = MetronomeWebhookEventSchema.safeParse(rawEvent);
  if (!parsedEvent.success) {
    // Metronome may add new event types or backward-compatible fields
    // without notice. Log and ack so we don't retry-storm.
    const rawType = z.object({ type: z.string() }).safeParse(rawEvent);
    logger.warn(
      {
        eventType: rawType.success ? rawType.data.type : "unknown",
        rawEvent,
        error: parsedEvent.error.message,
      },
      "[Metronome Webhook] Unknown or malformed event"
    );
    return ctx.json({ success: true });
  }

  const event = parsedEvent.data;

  logger.info({ event, rawEvent }, "[Metronome Webhook] Event received");

  // Resolve the workspace before enqueueing — every event except
  // `integration.issue` carries a customer_id. If the customer maps to
  // no workspace (e.g. wrong region, customer scrubbed), ack and skip:
  // spinning up a workflow just to no-op wastes a slot and clutters
  // Temporal history.
  const customerId = getCustomerIdFromEvent(event);
  const workspace = customerId
    ? await WorkspaceResource.fetchByMetronomeCustomerId(customerId)
    : null;

  if (!workspace) {
    return ctx.json({ success: true });
  }

  // Hand the event off to a Temporal workflow for durable processing.
  // The workflow id is derived from event.id, so Metronome redeliveries
  // (at-least-once delivery, retries on our own 5xx) hit
  // `WorkflowExecutionAlreadyStartedError` and we ack 200 without
  // re-running the work. Activity retries inside the workflow handle
  // transient Metronome/DB failures.
  const launchResult = await launchMetronomeEventsWorkflow({
    event,
    workspaceId: workspace.sId,
  });
  if (launchResult.isErr()) {
    return apiError(ctx, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: launchResult.error.message,
      },
    });
  }

  return ctx.json({ success: true });
});

export default app;
