// @migration-status: MIGRATED_TO_HONO
/** @ignoreswagger */
import apiConfig from "@app/lib/api/config";
import { unwrapMetronomeWebhook } from "@app/lib/metronome/client";
import {
  getCustomerIdFromEvent,
  MetronomeWebhookEventSchema,
} from "@app/lib/metronome/webhook_events";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchMetronomeEventsWorkflow } from "@app/temporal/metronome_events_queue/client";
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
        rawEvent = unwrapMetronomeWebhook(
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
        return res.status(200).json({ success: true });
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
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: launchResult.error.message,
          },
        });
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
