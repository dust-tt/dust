import type { NextApiRequest, NextApiResponse } from "next";

import { withSessionAuthenticationForPoke } from "@app/lib/api/auth_wrappers";
import { Authenticator } from "@app/lib/auth";
import type { SessionWithUser } from "@app/lib/iam/provider";
import { getResourceIdFromSId } from "@app/lib/resources/string_ids";
import { WebhookRequestResource } from "@app/lib/resources/webhook_request_resource";
import { apiError } from "@app/logger/withlogging";
import type { WithAPIErrorResponse } from "@app/types";
import { isString } from "@app/types";

export type PokeWebhookRequestType = {
  id: number;
  status: string;
  webhookSourceId: number;
  processedAt: number | null;
  errorMessage: string | null;
  createdAt: number;
  updatedAt: number;
};

export type PokeListWebhookRequests = {
  webhookRequests: PokeWebhookRequestType[];
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<PokeListWebhookRequests>>,
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
      const modelId = getResourceIdFromSId(webhookSourceId);
      if (!modelId) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid webhook source ID format.",
          },
        });
      }

      const webhookRequests =
        await WebhookRequestResource.fetchByWebhookSourceId(auth, modelId, {
          limit: 100,
          order: [["createdAt", "DESC"]],
        });

      return res.status(200).json({
        webhookRequests: webhookRequests.map((wr) => ({
          id: wr.id,
          status: wr.status,
          webhookSourceId: wr.webhookSourceId,
          processedAt: wr.processedAt ? wr.processedAt.getTime() : null,
          errorMessage: wr.errorMessage,
          createdAt: wr.createdAt.getTime(),
          updatedAt: wr.updatedAt.getTime(),
        })),
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
