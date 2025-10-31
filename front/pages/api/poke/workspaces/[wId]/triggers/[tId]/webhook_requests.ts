import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { WebhookRequestTriggerStatus } from "@app/lib/models/assistant/triggers/webhook_request_trigger";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { fetchRecentWebhookRequestTriggersWithPayload } from "@app/lib/triggers/webhook";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export interface PokeGetWebhookRequestsResponseBody {
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
  res: NextApiResponse<
    WithAPIErrorResponse<PokeGetWebhookRequestsResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const { wId } = req.query;
  if (typeof wId !== "string") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace was not found.",
      },
    });
  }

  const auth = await Authenticator.fromSuperUserSession(session, wId);
  const { tId } = req.query;

  if (!isString(tId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid trigger ID.",
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

  // Fetch the trigger to verify it exists and user has access.
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

  try {
    // Fetch the last 100 webhook request triggers for Poke debugging.
    const r = await fetchRecentWebhookRequestTriggersWithPayload(auth, {
      trigger: trigger.toJSON(),
      limit: 100,
    });

    return res.status(200).json({ requests: r });
  } catch (error) {
    logger.error(
      {
        error: error instanceof Error ? error.message : String(error),
        tId,
      },
      "Error fetching webhook requests in Poke"
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

export default withSessionAuthenticationForPoke(handler);
