import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import {
  getClientIpFromHeaders,
  isWorkOSIpAddress,
  validateWorkOSWebhookEvent,
} from "@app/lib/api/workos/webhook_helpers";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import { launchWorkOSEventsWorkflow } from "@app/temporal/workos_events_queue/client";
import type { WithAPIErrorResponse } from "@app/types";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>
): Promise<void> {
  if (req.method !== "POST") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, POST is expected.",
      },
    });
  }

  // Validate the webhook secret.
  const { webhookSecret } = req.query;
  if (typeof webhookSecret !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The webhookSecret query parameter is required.",
      },
    });
  }

  if (webhookSecret !== config.getWorkOSWebhookSecret()) {
    return apiError(req, res, {
      status_code: 401,
      api_error: {
        type: "not_authenticated",
        message: "The webhookSecret query parameter is invalid.",
      },
    });
  }

  // Validate the client IP address.
  const clientIp =
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    getClientIpFromHeaders(req.headers) || req.socket.remoteAddress;
  if (typeof clientIp !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Could not determine client IP address",
      },
    });
  }

  const isWorkOSIp = isWorkOSIpAddress(clientIp);
  if (!isWorkOSIp) {
    logger.error(
      {
        clientIp,
      },
      "Request not from WorkOS IP range"
    );

    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "invalid_request_error",
        message: "Request not from WorkOS IP range",
      },
    });
  }

  const { body: payload } = req;
  const sigHeader = req.headers["workos-signature"];
  if (typeof sigHeader !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The workos-signature header is required.",
      },
    });
  }

  const result = await validateWorkOSWebhookEvent(payload, {
    signatureHeader: sigHeader,
  });
  if (result.isErr()) {
    logger.error(
      {
        error: result.error,
      },
      "Invalid WorkOS webhook event"
    );

    return apiError(req, res, {
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
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: workflowId.error.message,
      },
    });
  }

  res.status(200).send();
}

export default withLogging(handler);
