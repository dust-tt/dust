import type { NextApiRequest, NextApiResponse } from "next";

import config from "@app/lib/api/config";
import { validateWorkOSWebhookEvent } from "@app/lib/api/workos/webhook_helpers";
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
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

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
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: result.error.message,
      },
    });
  }

  await launchWorkOSEventsWorkflow({
    eventPayload: result.value,
  });

  res.status(200).send();
}

export default withLogging(handler);
