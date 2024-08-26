import type { UserMessageType, WithAPIErrorResponse } from "@dust-tt/types";
import { isUserMessageType } from "@dust-tt/types";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

import { getConversation } from "@app/lib/api/assistant/conversation";
import { editUserMessageWithPubSub } from "@app/lib/api/assistant/pubsub";
import { withSessionAuthenticationForWorkspaceAsUser } from "@app/lib/api/wrappers";
import type { Authenticator } from "@app/lib/auth";
import { apiError } from "@app/logger/withlogging";

export const PostEditRequestBodySchema = t.type({
  content: t.string,
  mentions: t.array(t.type({ configurationId: t.string })),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<WithAPIErrorResponse<{ message: UserMessageType }>>,
  auth: Authenticator
): Promise<void> {
  const user = auth.user();
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

  const conversationId = req.query.cId;
  const conversation = await getConversation(auth, conversationId);
  if (!conversation) {
    return apiError(req, res, {
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found.",
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
  const messageId = req.query.mId;

  switch (req.method) {
    case "POST":
      const bodyValidation = PostEditRequestBodySchema.decode(req.body);

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

      const message = conversation.content
        .flat()
        .find((m) => m.sId === messageId);
      if (!message || !isUserMessageType(message)) {
        return apiError(req, res, {
          status_code: 400,
          api_error: {
            type: "invalid_request_error",
            message:
              "The message you're trying to edit does not exist or is not an user message.",
          },
        });
      }
      const { content, mentions } = bodyValidation.right;

      const editedMessageRes = await editUserMessageWithPubSub(auth, {
        conversation,
        message,
        content,
        mentions,
      });
      if (editedMessageRes.isErr()) {
        return apiError(req, res, editedMessageRes.error);
      }

      res.status(200).json({ message: editedMessageRes.value.userMessage });
      return;

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

export default withSessionAuthenticationForWorkspaceAsUser(handler);
