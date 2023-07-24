import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import {
  deleteChatSession,
  getChatSessionWithMessages,
  upsertChatSession,
} from "@app/lib/api/chat";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { parse_payload } from "@app/lib/http_utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import { ChatMessageType, ChatSessionType } from "@app/types/chat";

import { chatMessageSchema } from "./messages/[mId]";

const chatSessionCreateSchema: JSONSchemaType<{
  title?: string;
  messages?: ChatMessageType[];
}> = {
  type: "object",
  properties: {
    title: { type: "string", nullable: true },
    messages: {
      type: "array",
      items: chatMessageSchema,
      nullable: true,
    },
  },
};

export type ChatSessionResponseBody = {
  session: ChatSessionType;
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
        message: "Only users of the current workspace can retrieve chats.",
      },
    });
  }

  switch (req.method) {
    case "POST": {
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

      const pRes = parse_payload(chatSessionCreateSchema, req.body);
      if (pRes.isErr()) {
        res.status(400).end();
        return;
      }
      const s = pRes.value;

      const session = await upsertChatSession(auth, cId, s.title || null);

      res.status(200).json({
        session,
      });
      return;
    }

    case "GET": {
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

      const session = await getChatSessionWithMessages(auth, cId);

      if (!session) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "chat_session_not_found",
            message: "The chat session was not found.",
          },
        });
      }

      res.status(200).json({
        session,
      });
      return;
    }

    case "DELETE": {
      if (!(typeof req.query.cId === "string")) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: "Invalid query parameters, `cId` (string) is required.",
          },
        });
      }

      if (await deleteChatSession(auth, req.query.cId)) {
        res.status(200).json({
          session,
        });
        return;
      }
      return apiError(req, res, {
        status_code: 404,
        api_error: {
          type: "chat_session_not_found",
          message: "The chat session is not yours or was not found.",
        },
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
  }
}

export default withLogging(handler);
