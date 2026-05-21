// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import apiConfig from "@app/lib/api/config";
import { processMetronomeWebhook } from "@app/lib/api/metronome/process_webhook";
import { getMetronomeClient } from "@app/lib/metronome/client";
import { MetronomeWebhookEventSchema } from "@app/lib/metronome/webhook_events";
import {
  releaseMetronomeWebhookEvent,
  tryClaimMetronomeWebhookEvent,
} from "@app/lib/metronome/webhook_idempotency";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import { promisify } from "util";
import { z } from "zod";

type ResponseBody = {
  success: boolean;
  message?: string;
};

// Disable Next.js body parsing so we can read the raw body for signature verification.
export const config = {
  api: {
    bodyParser: false,
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<ResponseBody>>
): Promise<void> {
  switch (req.method) {
    case "GET":
      return res.status(200).json({ success: true });

    case "POST": {
      // Collect raw body.
      let rawBody = Buffer.from("");
      const collector = new Writable({
        write(chunk, _encoding, callback) {
          rawBody = Buffer.concat([rawBody, chunk]);
          callback();
        },
      });
      await promisify(pipeline)(req, collector);

      const bodyString = rawBody.toString("utf-8");

      // Verify signature using the Metronome SDK.
      const webhookSecret = apiConfig.getMetronomeWebhookSecret();
      if (!webhookSecret) {
        logger.error(
          "[Metronome Webhook] METRONOME_WEBHOOK_SECRET is not configured"
        );
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Webhook secret not configured.",
          },
        });
      }

      let rawEvent: unknown;
      try {
        const client = getMetronomeClient();
        rawEvent = client.webhooks.unwrap(
          bodyString,
          req.headers,
          webhookSecret
        );
      } catch (err) {
        logger.error(
          { error: normalizeError(err) },
          "[Metronome Webhook] Signature verification failed"
        );
        return apiError(req, res, {
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
        return res.status(200).json({ success: true });
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
        return res.status(200).json({ success: true });
      }

      let processingSucceeded = false;
      try {
        const result = await processMetronomeWebhook({ event });
        if (result.isErr()) {
          return apiError(req, res, {
            status_code: 500,
            api_error: {
              type: "internal_server_error",
              message: result.error.message,
            },
          });
        }
        processingSucceeded = true;
        return res.status(200).json({ success: true });
      } finally {
        if (!processingSucceeded) {
          await releaseMetronomeWebhookEvent(event.id);
        }
      }
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
