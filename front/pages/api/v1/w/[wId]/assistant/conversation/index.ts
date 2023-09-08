import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getAPIKey } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { Conversation } from "@app/lib/models";
import { generateModelSId } from "@app/lib/utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { ConversationType } from "@app/types/assistant/conversation";

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ConversationType | ReturnedAPIErrorType>
): Promise<void> {
  const keyRes = await getAPIKey(req);
  if (keyRes.isErr()) {
    return apiError(req, res, keyRes.error);
  }

  const { auth, keyWorkspaceId } = await Authenticator.fromKey(
    keyRes.value,
    req.query.wId as string
  );

  if (!keyRes.value.isSystem) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "The Assitant API is only accessible by system API Key. Ping us at team@dust.tt if you want access to it.",
      },
    });
  }

  if (keyWorkspaceId !== req.query.wId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The Assistant API is only available on your own workspace.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const conv = await Conversation.create({
        sId: generateModelSId(),
        title: req.body.title,
        created: new Date(),
        visibility: req.body.visibility,
      });
      return res.status(200).json({
        id: conv.id,
        created: conv.created.getTime(),
        sId: conv.sId,
        title: conv.title,
        visibility: conv.visibility,
        content: [],
      });

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

export default withLogging(handler);
