import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { computeFilteredWebhookTriggerForecast } from "@app/lib/triggers/trigger_usage_estimation";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type GetTriggerEstimationResponseBody = {
  matchingCount: number;
  totalCount: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<GetTriggerEstimationResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { webhookSourceId } = req.query;
  if (!isString(webhookSourceId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid webhook source ID.",
      },
    });
  }

  const { method } = req;

  switch (method) {
    case "GET": {
      const { filter, event } = req.query;

      if (filter && !isString(filter)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid filter parameter.",
          },
        });
      }

      if (event && !isString(event)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid event parameter.",
          },
        });
      }

      const webhookSourceResource = await WebhookSourceResource.fetchById(
        auth,
        webhookSourceId
      );

      if (!webhookSourceResource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "webhook_source_not_found",
            message: "The webhook source was not found.",
          },
        });
      }

      const estimationResult = await computeFilteredWebhookTriggerForecast(
        auth,
        {
          webhookSource: webhookSourceResource,
          filter,
          event,
        }
      );

      if (estimationResult.isErr()) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: estimationResult.error.message,
          },
        });
      }

      return res.status(200).json(estimationResult.value);
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
