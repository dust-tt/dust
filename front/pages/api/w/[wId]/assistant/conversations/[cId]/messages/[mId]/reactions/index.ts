/** @ignoreswagger */
import { apiErrorForConversation } from "@app/lib/api/assistant/conversation/helper";
import {
  createMessageReaction,
  deleteMessageReaction,
  getMessagesReactions,
} from "@app/lib/api/assistant/reaction";
import {
  publishAgentMessagesEvents,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import { withSessionAuthenticationForWorkspace } from "@app/lib/api/auth_wrappers";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { apiError } from "@app/logger/withlogging";
import type { MessageReactionType } from "@app/types/assistant/conversation";
import {
  ConversationError,
  isAgentMessageType,
  isProjectConversation,
  isUserMessageType,
} from "@app/types/assistant/conversation";
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

  if (!isString(req.query.cId) || !isString(req.query.mId)) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message:
          "Invalid query parameters, `cId` (string) and `mId` (string) are required.",
      },
    });
  }

  const conversation = await ConversationResource.fetchById(
    auth,
    req.query.cId
  );
  if (!conversation) {
    return apiErrorForConversation(
      req,
      res,
      new ConversationError("conversation_not_found")
    );
  }

  const serializedConversation = conversation.toJSON();

  if (isProjectConversation(serializedConversation)) {
    const space = await SpaceResource.fetchById(
      auth,
      serializedConversation.spaceId
    );
    if (!space) {
      return apiError(req, res, {
        status_code: 404,
        api_error: { type: "space_not_found", message: "Space not found." },
      });
    }
    if (!space.isMember(auth)) {
      return apiError(req, res, {
        status_code: 403,
        api_error: {
          type: "workspace_auth_error",
          message: "You are not a member of the project.",
        },
      });
    }
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

  const messageRes = await conversation.getMessageById(auth, messageId);
  // Preserve prior behavior: only main-branch user/agent messages are reactable.
  if (
    messageRes.isErr() ||
    messageRes.value.branchId !== null ||
    messageRes.value.contentFragmentId
  ) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "The message you're trying to react to does not exist.",
      },
    });
  }
  const message = messageRes.value;
  if (message.compactionMessageId) {
    return apiError(req, res, {
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Reactions are not allowed on compaction messages.",
      },
    });
  }

  switch (req.method) {
    case "POST":
      const created = await createMessageReaction(auth, {
        messageId,
        conversation: serializedConversation,
        user: user.toJSON(),
        context: {
          username: user.username,
          fullName: user.fullName(),
        },
        reaction: bodyValidation.right.reaction,
      });

      if (created) {
        await publishMessageUpdate(req, res, auth, { conversation, message });
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
        conversation: serializedConversation,
        user: user.toJSON(),
        context: {
          username: user.username,
          fullName: user.fullName(),
        },
        reaction: bodyValidation.right.reaction,
      });

      if (deleted) {
        await publishMessageUpdate(req, res, auth, { conversation, message });
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

const publishMessageUpdate = async (
  req: NextApiRequest,
  res: NextApiResponse<
    WithAPIErrorResponse<
      { reactions: MessageReactionType[] } | { success: boolean }
    >
  >,
  auth: Authenticator,
  {
    conversation,
    message,
  }: {
    conversation: ConversationType;
    message: UserMessageType | ContentFragmentType | AgentMessageType;
  }
) => {
  const reactions = await getMessagesReactions(auth, {
    messageIds: [message.id],
  });

  if (isUserMessageType(message)) {
    return publishMessageEventsOnMessagePostOrEdit(
      conversation,
      {
        ...message,
        contentFragments: getRelatedContentFragments(conversation, message),
        reactions: reactions[message.id] ?? [],
      },
      []
    );
  }

  if (isAgentMessageType(message)) {
    return publishAgentMessagesEvents(conversation, [
      {
        ...message,
        reactions: reactions[message.id] ?? [],
      },
    ]);
  }

  return apiError(req, res, {
    status_code: 500,
    api_error: {
      type: "internal_server_error",
      message: "Unexpected message type",
    },
  });
};

export default withSessionAuthenticationForWorkspace(handler);
