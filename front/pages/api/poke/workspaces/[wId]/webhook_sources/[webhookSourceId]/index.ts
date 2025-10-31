import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { WebhookSourceResource } from "@app/lib/resources/webhook_source_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";
import type { WebhookSourceForAdminType } from "@app/types/triggers/webhooks";

export type PokeGetWebhookSource = {
  webhookSource: WebhookSourceForAdminType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeGetWebhookSource>>,
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

  switch (req.method) {
    case "GET":
      const webhookSource = await WebhookSourceResource.fetchById(
        auth,
        webhookSourceId
      );

      if (!webhookSource) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "webhook_source_not_found",
            message: "Webhook source not found.",
          },
        });
      }

      return res.status(200).json({
        webhookSource: webhookSource.toJSONForAdmin(),
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, GET is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForPoke(handler);
