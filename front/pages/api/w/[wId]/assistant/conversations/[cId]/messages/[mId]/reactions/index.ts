/** @ignoreswagger */
import {
  createMessageReaction,
  deleteMessageReaction,
} from "@app/lib/api/assistant/reaction";
import {
  getReactionTargetMessageType,
  publishReactionUpdate,
} from "@app/lib/api/assistant/reaction_update";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import logger from "@app/logger/logger";
import { apiError } from "@app/logger/withlogging";
import type { MessageReactionType } from "@app/types/assistant/conversation";
import type { WithAPIErrorResponse } from "@app/types/error";
import { isLeft } from "fp-ts/lib/Either";
import * as t from "io-ts";
import * as reporter from "io-ts-reporters";
import type { NextApiRequest, NextApiResponse } from "next";

export const MessageReactionRequestBodySchema = t.type({
  reaction: t.string,
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      { reactions: MessageReactionType[] } | { success: boolean }
    >
  >,
  auth: Authenticator
): Promise<void> {
  const user = auth.getNonNullableUser();

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

  const conversation = await ConversationResource.fetchById(
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

  if (conversation.space && !conversation.space.isMember(auth)) {
    return apiError(req, res, {
      status_code: 403,
      api_error: {
        type: "workspace_auth_error",
        message: "You are not a member of the project.",
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

  const targetKind = await getReactionTargetMessageType(auth, {
    conversation,
    messageId,
  });
  if (targetKind === null) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The message you're trying to react to does not exist.",
      },
    });
  }
  if (targetKind === "compaction") {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Reactions are not allowed on compaction messages.",
      },
    });
  }

  const conversationJSON = conversation.toJSON();

  switch (req.method) {
    case "POST":
      const created = await createMessageReaction(auth, {
        messageId,
        conversation: conversationJSON,
        user: user.toJSON(),
        context: {
          username: user.username,
          fullName: user.fullName(),
        },
        reaction: bodyValidation.right.reaction,
      });

      if (created) {
        const pubRes = await publishReactionUpdate(auth, {
          conversation,
          messageId,
        });
        if (pubRes.isErr()) {
          logger.error(
            { err: pubRes.error, conversationId, messageId },
            "Failed to publish reaction update."
          );
        }
        res.status(200).json({ success: true });
        return;
      }
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The message you're trying to react to does not exist.",
        },
      });

    case "DELETE":
      const deleted = await deleteMessageReaction(auth, {
        messageId,
        conversation: conversationJSON,
        user: user.toJSON(),
        context: {
          username: user.username,
          fullName: user.fullName(),
        },
        reaction: bodyValidation.right.reaction,
      });

      if (deleted) {
        const pubRes = await publishReactionUpdate(auth, {
          conversation,
          messageId,
        });
        if (pubRes.isErr()) {
          logger.error(
            { err: pubRes.error, conversationId, messageId },
            "Failed to publish reaction update."
          );
        }
        res.status(200).json({ success: true });
        return;
      }
      return apiError(req, res, {
        status_code: 400,
        api_error: {
          type: "invalid_request_error",
          message: "The message you're trying to react to does not exist.",
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

export default withSessionAuthenticationForWorkspace(handler);
