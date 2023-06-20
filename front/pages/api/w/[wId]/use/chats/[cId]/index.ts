import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import { getChatSession, storeChatSession } from "@app/lib/api/chat";
import { Authenticator, getSession, getUserFromSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { parse_payload } from "@app/lib/http_utils";
import { apiError, withLogging } from "@app/logger/withlogging";
import {
  ChatMessageType,
  ChatRetrievedDocumentType,
  ChatSessionType,
} from "@app/types/chat";

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

const chatMessageSchema: JSONSchemaType<ChatMessageType> = {
  type: "object",
  properties: {
    role: { type: "string" },
    message: { type: "string", nullable: true },
    retrievals: {
      type: "array",
      items: chatRetrievedDocumentSchema,
      nullable: true,
    },
    content: { type: "object", nullable: true },
    name: { type: "string", nullable: true },
    function_call: { type: "string", nullable: true },
  },
  required: ["role"],
};

const chatSessionCreateSchema: JSONSchemaType<{
  title?: string;
  messages: ChatMessageType[];
}> = {
  type: "object",
  properties: {
    title: { type: "string", nullable: true },
    messages: {
      type: "array",
      items: chatMessageSchema,
    },
  },
  required: ["messages"],
};

export type ChatSessionResponseBody = {
  session: ChatSessionType;
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

      const session = await storeChatSession(
        cId,
        owner,
        user,
        s.title || null,
        s.messages
      );

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

      const session = await getChatSession(owner, cId);
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

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET or POST is expected.",
        },
      });
      break;
  }
}

export default withLogging(handler);
