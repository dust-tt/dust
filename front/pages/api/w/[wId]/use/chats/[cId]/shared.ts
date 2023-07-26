import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import {
  getChatSession,
  updateChatSessionShared,
  userIsChatSessionOwner,
} from "@app/lib/api/chat";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { parse_payload } from "@app/lib/http_utils";
import logger from "@app/logger/logger";
import { apiError, statsDClient, withLogging } from "@app/logger/withlogging";

export const conversationSharedSchema: JSONSchemaType<{
  shared: boolean;
}> = {
  type: "object",
  properties: {
    shared: { type: "boolean" },
  },
  required: ["shared"],
};

export type ChatSessionResponseBody = {
  count: number;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ChatSessionResponseBody | ReturnedAPIErrorType>
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
        message: "API restricted to users of the current workspace.",
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

  const chatSession = await getChatSession(auth, req.query.cId as string);

  if (!chatSession) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "chat_session_not_found",
        message: "The chat session you're trying to modify was not found.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
      if (!userIsChatSessionOwner(user, chatSession)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "chat_session_auth_error",
            message:
              "The chat session you're trying to modify does not belong to you.",
          },
        });
      }

      const pRes = parse_payload(conversationSharedSchema, req.body);
      if (pRes.isErr()) {
        res.status(400).end();
        return;
      }
      const shared = pRes.value.shared;
      const result = await updateChatSessionShared({
        owner,
        sId: chatSession.sId,
        shared,
      });

      const loggerArgs = {
        workspace: {
          sId: owner.sId,
          name: owner.name,
        },
        chatSessionId: chatSession.sId,
        shared,
      };

      logger.info(loggerArgs, "Conversation shared");

      const tags = [`workspace:${owner.sId}`, `workspace_name:${owner.name}`];
      if (shared) {
        statsDClient.increment("conversation_shared_positive.count", 1, tags);
      } else {
        statsDClient.increment("chat_feedback_negative.count", 1, tags);
      }

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
