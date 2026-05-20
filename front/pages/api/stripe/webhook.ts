// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import apiConfig from "@app/lib/api/config";
import { processStripeWebhookEvent } from "@app/lib/api/stripe/webhook_handler";
import { getStripeClient } from "@app/lib/plans/stripe";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import type { NextApiRequest, NextApiResponse } from "next";
import { pipeline, Writable } from "stream";
import type Stripe from "stripe";
import { promisify } from "util";

export type GetResponseBody = {
  success: boolean;
  message?: string;
};

export const config = {
  api: {
    bodyParser: false, // Disable the default body parser
  },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetResponseBody>>
): Promise<void> {
  const stripe = getStripeClient();

  switch (req.method) {
    case "GET":
      return res.status(200).json({ success: true });

    case "POST":
      const sig = req.headers["stripe-signature"] as string;
      let event: Stripe.Event | null = null;

      // Collect raw body using stream pipeline
      let rawBody = Buffer.from("");
      const collector = new Writable({
        write(chunk, _encoding, callback) {
          rawBody = Buffer.concat([rawBody, chunk]);
          callback();
        },
      });
      await promisify(pipeline)(req, collector);

      try {
        event = stripe.webhooks.constructEvent(
          rawBody,
          sig,
          apiConfig.getStripeSecretWebhookKey()
        );
      } catch (error) {
        logger.error({ error }, "Error constructing Stripe event in Webhook.");
      }

      if (!event) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "internal_server_error",
            message:
              "Invalid Stripe Webhook event, the signature may not be valid.",
          },
        });
      }

      const result = await processStripeWebhookEvent({
        event,
        stripe,
        now: new Date(),
      });
      if (result.isErr()) {
        return apiError(req, res, result.error);
      }
      return res.status(200).json({ success: true });

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
