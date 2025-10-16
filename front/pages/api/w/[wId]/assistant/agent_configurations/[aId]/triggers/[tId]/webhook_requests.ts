import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import type { WebhookRequestTriggerStatus } from "@app/lib/models/assistant/triggers/webhook_request_trigger";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { fetchRecentWebhookRequestTriggersWithPayload } from "@app/lib/triggers/webhook";
import logger from "@app/logger/logger";
import { apiError, withLogging } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export interface GetWebhookRequestsResponseBody {
  requests: Array<{
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }>;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetWebhookRequestsResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { aId, tId } = req.query;

  if (!isString(aId) || !isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid agent configuration ID or trigger ID.",
      },
    });
  }

  if (req.method !== "GET") {
    return apiError(req, res, {
      status_code: 405,
      api_error: {
        type: "method_not_supported_error",
        message: "The method passed is not supported, GET is expected.",
      },
    });
  }

  // Fetch the trigger to verify it exists and user has access
  const trigger = await TriggerResource.fetchById(auth, tId);
  if (!trigger) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "Trigger not found.",
      },
    });
  }

  // Verify the trigger belongs to the agent configuration
  if (trigger.agentConfigurationId !== aId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Trigger does not belong to the specified agent configuration.",
      },
    });
  }

  try {
    // Fetch the last 15 webhook request triggers
    const r = await fetchRecentWebhookRequestTriggersWithPayload(auth, {
      trigger: trigger.toJSON(),
      limit: 15,
    });

    return res.status(200).json({ requests: r });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        aId,
        tId,
      },
      "Error fetching webhook requests"
    );
    return apiError(req, res, {
      status_code: 500,
      api_error: {
        type: "internal_server_error",
        message: "Failed to fetch webhook requests.",
      },
    });
  }
}

export default withLogging(withSessionAuthenticationForWorkspace(handler));
