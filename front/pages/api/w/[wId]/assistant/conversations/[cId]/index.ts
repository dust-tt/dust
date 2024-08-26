import type {
  ConversationWithoutContentType,
  WithAPIErrorResponse,
} from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import {
  deleteConversation,
  getConversationWithoutContent,
  updateConversation,
} from "@app/lib/api/assistant/conversation";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export const PatchConversationsRequestBodySchema = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([
    t.literal("unlisted"),
    t.literal("workspace"),
    t.literal("deleted"),
    t.literal("test"),
  ]),
});

export type GetConversationsResponseBody = {
  conversation: ConversationWithoutContentType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<GetConversationsResponseBody | void>
  >,
  auth: Authenticator
): Promise<void> {
  if (!auth.isUser()) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message:
          "Only users of the current workspace can access chat sessions.",
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

  const conversation = await getConversationWithoutContent(auth, req.query.cId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "The conversation you're trying to access was not found.",
      },
    });
  }

  switch (req.method) {
    case "GET":
      res.status(200).json({ conversation });
      return;

    case "DELETE":
      await deleteConversation(auth, { conversationId: conversation.sId });

      res.status(200).end();
      return;

    case "PATCH":
      const bodyValidation = PatchConversationsRequestBodySchema.decode(
        req.body
      );

      if (isLeft(bodyValidation)) {
        const pathError = reporter.formatValidationErrors(bodyValidation.left);

        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message: `Invalid request body: ${pathError}`,
          },
        });
      }

      const { title, visibility } = bodyValidation.right;

      const c = await updateConversation(auth, conversation.sId, {
        title,
        visibility,
      });

      res.status(200).json({ conversation: c });
      return;

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, GET, PATCH or DELETE is expected.",
        },
      });
  }
}

export default withSessionAuthenticationForWorkspaceAsUser(handler);
