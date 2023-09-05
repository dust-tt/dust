import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import { nullable } from "@app/lib/ajv_utils";
import {
  getChatMessage,
  getChatSession,
  upsertChatMessage,
  userIsChatSessionOwner,
} from "@app/lib/api/chat";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { front_sequelize } from "@app/lib/databases";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { parse_payload } from "@app/lib/http_utils";
import { ChatMessage, ChatRetrievedDocument } from "@app/lib/models";
import { apiError, withLogging } from "@app/logger/withlogging";
import { ChatMessageType, ChatRetrievedDocumentType } from "@app/types/chat";

const chatRetrievedDocumentSchema: JSONSchemaType<ChatRetrievedDocumentType> = {
  type: "object",
  properties: {
    dataSourceId: { type: "string" },
    sourceUrl: { type: "string" },
    documentId: { type: "string" },
    timestamp: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    score: { type: "number" },
    chunks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          offset: { type: "number" },
          score: { type: "number" },
        },
        required: ["text", "offset", "score"],
      },
    },
  },
  required: [
    "dataSourceId",
    "sourceUrl",
    "documentId",
    "timestamp",
    "tags",
    "score",
    "chunks",
  ],
};

export const chatMessageSchema: JSONSchemaType<ChatMessageType> = {
  type: "object",
  properties: {
    sId: { type: "string" },
    role: { type: "string" },
    message: nullable({ type: "string" }),
    retrievals: nullable({
      type: "array",
      items: chatRetrievedDocumentSchema,
    }),
    params: nullable({
      type: "object",
      properties: {
        query: { type: "string" },
        minTimestamp: { type: "number" },
      },
      required: ["query", "minTimestamp"],
    }),
    feedback: nullable({ type: "string" }),
  },
  required: ["role"],
};

export type ChatMessageResponseBody = {
  message: ChatMessageType;
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

  const chatSession = await getChatSession(auth, req.query.cId);

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
      if (!userIsChatSessionOwner(user, chatSession)) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "chat_session_auth_error",
            message:
              "The chat session for the message you're trying to modify does not belong to you.",
          },
        });
      }

      const pRes = parse_payload(chatMessageSchema, req.body);
      if (pRes.isErr()) {
        res.status(400).end();
        return;
      }
      const m = pRes.value;
      const message = await upsertChatMessage(chatSession, m);
      res.status(200).json({
        message,
      });
      return;
    }
    case "GET": {
      const message = await getChatMessage(req.query.mId, chatSession);
      if (!message) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "chat_message_not_found",
            message: "The chat message was not found.",
          },
        });
      }

      res.status(200).json({
        message,
      });
      return;
    }
    case "DELETE": {
      const message = await ChatMessage.findOne({
        where: { sId: req.query.mId, chatSessionId: chatSession.id },
      });
      if (!message) {
        return apiError(req, res, {
          status_code: 404,
          api_error: {
            type: "chat_message_not_found",
            message: "The chat message was not found.",
          },
        });
      }
      // delete all documents that were retrieved by this message and the message itself
      // in a transaction
      await front_sequelize.transaction(async (t) => {
        await Promise.all([
          ChatRetrievedDocument.destroy({
            where: {
              chatMessageId: message.id,
            },
            transaction: t,
          }),
          message.destroy({
            transaction: t,
          }),
        ]);
      });
      // return the deleted message
      res.status(200).json({
        message: {
          ...message,
          message: message.message,
          retrievals: null,
          params: null,
        },
      });
      return;
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
