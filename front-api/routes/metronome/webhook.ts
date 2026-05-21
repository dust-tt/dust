import apiConfig from "@app/lib/api/config";
import { processMetronomeWebhook } from "@app/lib/api/metronome/process_webhook";
import { getMetronomeClient } from "@app/lib/metronome/client";
import { MetronomeWebhookEventSchema } from "@app/lib/metronome/webhook_events";
import {
  releaseMetronomeWebhookEvent,
  tryClaimMetronomeWebhookEvent,
} from "@app/lib/metronome/webhook_idempotency";
import logger from "@app/logger/logger";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { apiError, type HandlerResult } from "@front-api/middleware/utils";
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
    const client = getMetronomeClient();
    rawEvent = client.webhooks.unwrap(bodyString, headers, webhookSecret);
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

  // Idempotency: Metronome may redeliver the same event (network
  // timeouts, our own 5xx, at-least-once delivery). Atomically claim
  // `event.id` in Redis; a duplicate finds the key set and short-
  // circuits to a no-op success. The claim is released on the failure
  // path below (Err or thrown exception) so a retry can reprocess.
  const claimed = await tryClaimMetronomeWebhookEvent(event.id);
  if (!claimed) {
    logger.info(
      { eventId: event.id, eventType: event.type },
      "[Metronome Webhook] Event already processed (duplicate), skipping"
    );
    return ctx.json({ success: true });
  }

  let processingSucceeded = false;
  try {
    const result = await processMetronomeWebhook({ event });
    if (result.isErr()) {
      return apiError(ctx, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: result.error.message,
        },
      });
    }
    processingSucceeded = true;
    return ctx.json({ success: true });
  } finally {
    if (!processingSucceeded) {
      await releaseMetronomeWebhookEvent(event.id);
    }
  }
});

export default app;
