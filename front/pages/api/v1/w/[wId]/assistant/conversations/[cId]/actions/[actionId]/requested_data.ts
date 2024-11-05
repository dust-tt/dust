import type { WithAPIErrorResponse } from "@dust-tt/types";
import type { NextApiRequest, NextApiResponse } from "next";

import { getRedisClient } from "@app/lib/api/redis";
import { withPublicAPIAuthentication } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<void>>,
  auth: Authenticator
): Promise<void> {
  const { cId, actionId } = req.query;
  if (typeof cId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
      },
    });
  }

  if (typeof actionId !== "string") {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Action not found.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const redis = await getRedisClient({ origin: "request_user_data" });
      const message = JSON.parse(req.body);
      await redis.xAdd(`request_data_action_${actionId}`, "*", message);
      res.status(200).end();
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message: "The method passed is not supported, POST is expected.",
        },
      });
  }
}

export default withPublicAPIAuthentication(handler, { isStreaming: true });
