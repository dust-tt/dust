import { JSONSchemaType } from "ajv";
import { NextApiRequest, NextApiResponse } from "next";

import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { parse_payload } from "@app/lib/http_utils";
import { apiError } from "@app/logger/withlogging";
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

const chatMessageSchema: JSONSchemaType<ChatMessageType> = {
  type: "object",
  properties: {
    role: { type: "string" },
    runRetrieval: { type: "boolean", nullable: true },
    runAssistant: { type: "boolean", nullable: true },
    message: { type: "string", nullable: true },
    retrievals: {
      type: "array",
      items: chatRetrievedDocumentSchema,
      nullable: true,
    },
  },
  required: ["role"],
};

const chatSessionSchema: JSONSchemaType<{
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

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ReturnedAPIErrorType>
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

      const pRes = parse_payload(chatSessionSchema, req.body);
      if (pRes.isErr()) {
        res.status(400).end();
        return;
      }
      const session = pRes.value;

      res.status(200);
      return;
    }

    default:
      res.status(405).end();
      break;
  }
}
