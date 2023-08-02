import { NextApiRequest, NextApiResponse } from "next";

import { getChatSessions, getChatSessionWithMessages } from "@app/lib/api/chat";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { ChatSessionType } from "@app/types/chat";

export type GetChatSessionsResponseBody = {
  sessions: ChatSessionType[];
};
export type GetChatSessionResponseBody = {
  session: ChatSessionType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | GetChatSessionsResponseBody
    | GetChatSessionResponseBody
    | ReturnedAPIErrorType
  >
) {
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

  switch (req.method) {
    case "GET":
      if (req.query.cId && typeof req.query.cId === "string") {
        const session = await getChatSessionWithMessages(auth, req.query.cId);
        if (!session) {
          return apiError(req, res, {
            status_code: 404,
            api_error: {
              type: "chat_session_not_found",
              message:
                "The chat session you're trying to retrieve was not found.",
            },
          });
        }
        return res.status(200).json({ session });
      }

      const limit = req.query.limit ? parseInt(req.query.limit as string) : 10;
      const offset = req.query.offset
        ? parseInt(req.query.offset as string)
        : 0;
      const workspaceScope = req.query.workspaceScope === "true" ? true : false;
      const sessions = await getChatSessions(auth, {
        limit,
        offset,
        workspaceScope,
      });

      res.status(200).json({
        sessions,
      });
      return;

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

export default withLogging(handler);
