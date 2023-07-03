import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import { getChatSession, updateChatMessageFeedback } from "@app/lib/api/chat";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { parse_payload } from "@app/lib/http_utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { MessageFeedbackStatus } from "@app/types/chat";

export const messageFeedbackSchema: JSONSchemaType<{
  feedback: MessageFeedbackStatus;
}> = {
  type: "object",
  properties: {
    feedback: { type: "string" },
  },
  required: ["feedback"],
};

export type ChatMessageResponseBody = {
  count: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatMessageResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
  const user = await getUserFromSession(session);
  const auth = await Authenticator.fromSession(
    session,
    req.query.wId as string
  );

  const owner = auth.workspace();
  if (!owner) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_not_found",
        message: "The workspace you're trying to modify was not found.",
      },
    });
  }

  if (!user) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "workspace_user_not_found",
        message: "Could not find the user of the current session.",
      },
    });
  }

  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "Only users of the current workspace can retrieve chats.",
      },
    });
  }

  if (!(typeof req.query.cId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `cId` (string) is required.",
      },
    });
  }

  if (!(typeof req.query.mId === "string")) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid query parameters, `mId` (string) is required.",
      },
    });
  }

  const chatSession = await getChatSession({
    owner,
    user,
    sId: req.query.cId as string,
  });

  if (!chatSession) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "chat_session_not_found",
        message:
          "The chat session for the message you're trying to modify was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      const pRes = parse_payload(messageFeedbackSchema, req.body);
      if (pRes.isErr()) {
        res.status(400).end();
        return;
      }
      const feedback = pRes.value.feedback;
      const result = await updateChatMessageFeedback({
        chatSession,
        feedback,
        sId: req.query.mId as string,
      });

      res.status(200).json({
        count: result[0],
      });
      return;
    }
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
