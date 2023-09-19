import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import {
  deleteConversation,
  getConversation,
  updateConversation,
} from "@app/lib/api/assistant/conversation";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { ConversationType } from "@app/types/assistant/conversation";

export const PatchConversationsRequestBodySchema = t.type({
  title: t.union([t.string, t.null]),
  visibility: t.union([t.literal("unlisted"), t.literal("workspace")]),
});

export type GetConversationsResponseBody = {
  conversation: ConversationType;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    GetConversationsResponseBody | ReturnedAPIErrorType | void
  >
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

  const conversation = await getConversation(auth, req.query.cId);
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
      await deleteConversation(auth, conversation.sId);

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

export default withLogging(handler);
