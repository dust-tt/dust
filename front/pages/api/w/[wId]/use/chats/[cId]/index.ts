import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import {
  deleteChatSession,
  getChatSession,
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

const chatSessionUpdateSchema: JSONSchemaType<{
  visibility: "private" | "workspace";
}> = {
  type: "object",
  properties: {
    visibility: {
      type: "string",
      enum: ["private", "workspace"],
    },
  },
  required: ["visibility"],
};

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

      const session = await upsertChatSession(auth, cId, s.title || null, null);

      res.status(200).json({
        session,
      });
      return;
    }

    case "PATCH": {
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

      const user = auth.user();
      if (!user?.id || user.id !== session.userId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "chat_session_auth_error",
            message: "The chat session can only be udpated by its author.",
          },
        });
      }

      const pRes = parse_payload(chatSessionUpdateSchema, req.body);
      if (pRes.isErr()) {
        res.status(400).end();
        return;
      }
      const s = pRes.value;
      const updatedSession = await upsertChatSession(
        auth,
        cId,
        null,
        s.visibility
      );

      res.status(200).json({
        session: updatedSession,
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
        return res.status(200).json({ session: null });
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

      const user = auth.user();
      const chatSessionId = req.query.cId;
      const chatSession = await getChatSession(auth, chatSessionId);

      if (!chatSession) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "chat_session_not_found",
            message:
              "There was a problem retrieving the conversation to delete.",
          },
        });
      }

      if (!user?.id || user.id !== chatSession.userId) {
        return apiError(req, res, {
          status_code: 403,
          api_error: {
            type: "chat_session_auth_error",
            message: "The conversation can only be deleted by its author.",
          },
        });
      }

      if (await deleteChatSession(auth, chatSessionId)) {
        res.status(200).json({
          session,
        });
        return;
      }

      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "internal_server_error",
          message: "Couldn't delete the conversation.",
        },
      });
    }

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST or PATCH or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
