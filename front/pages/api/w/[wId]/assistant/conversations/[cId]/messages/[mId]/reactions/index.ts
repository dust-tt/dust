import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import { NextApiRequest, NextApiResponse } from "next";

import { getConversationWithoutContent } from "@app/lib/api/assistant/conversation";
import {
  createMessageReaction,
  deleteMessageReaction,
} from "@app/lib/api/assistant/reaction";
import { Authenticator, getSession } from "@app/lib/auth";
import { ReturnedAPIErrorType } from "@app/lib/error";
import { apiError, withLogging } from "@app/logger/withlogging";
import { MessageReactionType } from "@app/types/assistant/conversation";

export const MessageReactionRequestBodySchema = t.type({
  reaction: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | { reactions: MessageReactionType[] }
    | { success: boolean }
    | ReturnedAPIErrorType
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
        message: "Only users of the current workspace can add reactions.",
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
  const conversation = await getConversationWithoutContent(
    auth,
    conversationId
  );
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
  const bodyValidation = MessageReactionRequestBodySchema.decode(req.body);
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

  switch (req.method) {
    case "POST":
      const created = await createMessageReaction(auth, {
        messageId,
        conversation,
        user: user,
        context: {
          username: user.username,
          fullName: user.fullName,
        },
        reaction: bodyValidation.right.reaction,
      });

      if (created) {
        res.status(200).json({ success: true });
        return;
      }
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "message_reaction_error",
          message: "Message reaction not created.",
        },
      });

    case "DELETE":
      const deleted = await deleteMessageReaction(auth, {
        messageId,
        conversation,
        user: user,
        context: {
          username: user.username,
          fullName: user.fullName,
        },
        reaction: bodyValidation.right.reaction,
      });

      if (deleted) {
        res.status(200).json({ success: true });
      }
      return apiError(req, res, {
        status_code: 500,
        api_error: {
          type: "message_reaction_error",
          message: "Message reaction not deleted.",
        },
      });

    default:
      return apiError(req, res, {
        status_code: 405,
        api_error: {
          type: "method_not_supported_error",
          message:
            "The method passed is not supported, POST or DELETE is expected.",
        },
      });
  }
}

export default withLogging(handler);
