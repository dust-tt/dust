import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import type { WebhookRequestTriggerStatus } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { WEBHOOK_REQUEST_TRIGGER_STATUSES } from "@app/lib/models/agent/triggers/webhook_request_trigger";
import { TriggerResource } from "@app/lib/resources/trigger_resource";
import { fetchRecentWebhookRequestTriggersWithPayload } from "@app/lib/triggers/webhook";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isString } from "@app/types/shared/utils/general";
import type { NextApiRequest, NextApiResponse } from "next";

export interface PokeGetWebhookRequestsResponseBody {
  requests: {
    id: number;
    timestamp: number;
    status: WebhookRequestTriggerStatus;
    payload?: {
      headers?: Record<string, string | string[]>;
      body?: unknown;
    };
  }[];
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<PokeGetWebhookRequestsResponseBody>
  >,
  session: SessionWithUser
): Promise<void> {
  const auth = await Authenticator.fromSuperUserSession(
    session,
    req.query.wId as string
  );

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

  if (!auth.isDustSuperUser()) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "trigger_not_found",
        message: "Could not find trigger.",
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

  const { limit: limitParam, status: statusParam } = req.query;
  const limit = isString(limitParam) ? parseInt(limitParam, 10) : undefined;

  let status: WebhookRequestTriggerStatus | undefined;
  if (isString(statusParam)) {
    const found = WEBHOOK_REQUEST_TRIGGER_STATUSES.find(
      (s) => s === statusParam
    );
    if (!found) {
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: `Invalid status filter. Must be one of: ${WEBHOOK_REQUEST_TRIGGER_STATUSES.join(", ")}`,
        },
      });
    }
    status = found;
  }

  const r = await fetchRecentWebhookRequestTriggersWithPayload(auth, {
    trigger: trigger.toJSON(),
    ...(limit && !isNaN(limit) ? { limit } : {}),
    status,
  });

  return res.status(200).json({ requests: r });
}

export default withSessionAuthenticationForPoke(handler);
