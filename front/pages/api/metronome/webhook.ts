/** @ignoreswagger */
import apiConfig from "@app/lib/api/config";
import { getMetronomeClient } from "@app/lib/metronome/client";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import { promisify } from "util";

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

      let event: { type: string; [key: string]: unknown };
      try {
        const client = getMetronomeClient();
        event = client.webhooks.unwrap(
          bodyString,
          req.headers,
          webhookSecret
        ) as { type: string; [key: string]: unknown };
      } catch (err) {
        logger.error(
          { error: err },
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

      switch (event.type) {
        case "alerts.low_remaining_credit_balance_reached":
          logger.info({ event }, "[Metronome Webhook] Credits exhausted alert");
          break;

        case "alerts.low_remaining_seat_balance_reached":
          logger.info(
            { event },
            "[Metronome Webhook] Per-seat credits exhausted alert"
          );
          break;

        case "alerts.spend_threshold_reached":
          logger.info({ event }, "[Metronome Webhook] Approaching spend limit");
          break;

        case "commit.segment.start":
          logger.info(
            { event },
            "[Metronome Webhook] New commit segment started (credits available)"
          );
          break;

        case "credit.create":
          logger.info(
            { event },
            "[Metronome Webhook] Credit created (credits available)"
          );
          break;

        case "contract.start":
          logger.info({ event }, "[Metronome Webhook] Contract started");
          break;

        case "contract.end":
          logger.info({ event }, "[Metronome Webhook] Contract ended");
          break;

        case "invoice.finalized":
          logger.info({ event }, "[Metronome Webhook] Invoice finalized");
          break;

        case "invoice.billing_provider_error":
          logger.error(
            { event },
            "[Metronome Webhook] Billing provider error on invoice"
          );
          break;

        default:
          logger.info(
            { eventType: event.type },
            "[Metronome Webhook] Unhandled event type"
          );
          break;
      }

      return res.status(200).json({ success: true });
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
