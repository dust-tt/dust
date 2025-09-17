import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";

export type DeleteWebhookSourceResponseBody = {
  success: true;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<DeleteWebhookSourceResponseBody>>,
  auth: Authenticator
): Promise<void> {
  const { webhookSourceId } = req.query;
  if (typeof webhookSourceId !== "string") {
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
    case "DELETE": {
      try {
        const webhookSourceResource = await WebhookSourceResource.fetchById(
          auth,
          webhookSourceId
        );

        if (!webhookSourceResource) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "webhook_source_not_found",
              message:
                "The webhook source you're trying to delete was not found.",
            },
          });
        }

        const deleteResult = await webhookSourceResource.delete(auth);
        if (deleteResult.isErr()) {
          throw deleteResult.error;
        }

        return res.status(200).json({
          success: true,
        });
      } catch (error) {
        return apiError(req, res, {
          status_code: 500,
          api_error: {
            type: "internal_server_error",
            message: "Failed to delete webhook source.",
          },
        });
      }
    }

    default: {
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, DELETE is expected.",
        },
      });
    }
  }
}

export default withSessionAuthenticationForWorkspace(handler);
