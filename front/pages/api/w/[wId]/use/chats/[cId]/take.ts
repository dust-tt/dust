import { NextApiRequest, NextApiResponse } from "next";

import { getChatSession, takeOwnerShipOfChatSession } from "@app/lib/api/chat";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { ChatSessionType } from "@app/types/chat";

export type ChatSessionResponseBody = {
  session: ChatSessionType | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatSessionResponseBody | ReturnedAPIErrorType>
): Promise<void> {
  const session = await getSession(req, res);
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

  if (!auth.user()) {
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
        message:
          "Only users of the current workspace can update chat sessions.",
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
  const cId = req.query.cId;

  switch (req.method) {
    case "POST": {
      const chatSession = await getChatSession(auth, cId);
      if (!chatSession) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "chat_session_not_found",
            message: "The chat session was not found.",
          },
        });
      }

      if (
        chatSession.userId !== null &&
        chatSession.userId !== auth.user()?.id
      ) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "chat_session_auth_error",
            message:
              "You can't take ownership of a chat session already owned by another user.",
          },
        });
      }

      const session = await takeOwnerShipOfChatSession(auth, cId);

      res.status(200).json({
        session,
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
