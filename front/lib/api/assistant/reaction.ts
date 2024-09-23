import {
  ConversationPermissionError,
  Err,
  Ok,
  type UserType,
} from "@dust-tt/types";
import type {
  ConversationMessageReactions,
  ConversationType,
  ConversationWithoutContentType,
  MessageReactionType,
  Result,
} from "@dust-tt/types";

import type { Authenticator } from "@app/lib/auth";
import {
  Message,
  MessageReaction,
} from "@app/lib/models/assistant/conversation";
import { canAccessConversation } from "@app/lib/api/assistant/conversation";

/**
 * We retrieve the reactions for a whole conversation, not just a single message.
 */
export async function getMessageReactions(
  auth: Authenticator,
  conversation: ConversationType | ConversationWithoutContentType
): Promise<Result<ConversationMessageReactions, ConversationPermissionError>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  if (!canAccessConversation(auth, conversation)) {
    return new Err(new ConversationPermissionError());
  }

  const messages = await Message.findAll({
    where: {
      conversationId: conversation.id,
    },
    attributes: ["sId"],
    include: [
      {
        model: MessageReaction,
        as: "reactions",
        required: false,
      },
    ],
  });

  return new Ok(
    messages.map((m) => ({
      messageId: m.sId,
      reactions: _renderMessageReactions(m.reactions || []),
    }))
  );
}

function _renderMessageReactions(
  reactions: MessageReaction[]
): MessageReactionType[] {
  return reactions.reduce<MessageReactionType[]>(
    (acc: MessageReactionType[], r: MessageReaction) => {
      const reaction = acc.find((r2) => r2.emoji === r.reaction);
      if (reaction) {
        reaction.users.push({
          userId: r.userId,
          username: r.userContextUsername,
          fullName: r.userContextFullName,
        });
      } else {
        acc.push({
          emoji: r.reaction,
          users: [
            {
              userId: r.userId,
              username: r.userContextUsername,
              fullName: r.userContextFullName,
            },
          ],
        });
      }
      return acc;
    },
    []
  );
}

/**
 * We create a reaction for a single message.
 * As user can be null (user from Slack), we also store the user context, as we do for messages.
 */
export async function createMessageReaction(
  auth: Authenticator,
  {
    messageId,
    conversation,
    user,
    context,
    reaction,
  }: {
    messageId: string;
    conversation: ConversationType | ConversationWithoutContentType;
    user: UserType | null;
    context: {
      username: string;
      fullName: string | null;
    };
    reaction: string;
  }
): Promise<boolean | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const message = await Message.findOne({
    where: {
      sId: messageId,
      conversationId: conversation.id,
    },
  });

  if (!message) {
    return null;
  }

  const newReaction = await MessageReaction.create({
    messageId: message.id,
    userId: user ? user.id : null,
    userContextUsername: context.username,
    userContextFullName: context.fullName,
    reaction,
  });
  return newReaction !== null;
}

/**
 * The id of a reaction is not exposed on the API so we need to find it from the message id and the user context.
 * We destroy reactions, no point in soft-deleting them.
 */
export async function deleteMessageReaction(
  auth: Authenticator,
  {
    messageId,
    conversation,
    user,
    context,
    reaction,
  }: {
    messageId: string;
    conversation: ConversationType | ConversationWithoutContentType;
    user: UserType | null;
    context: {
      username: string;
      fullName: string | null;
    };
    reaction: string;
  }
): Promise<boolean | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const message = await Message.findOne({
    where: {
      sId: messageId,
      conversationId: conversation.id,
    },
  });

  if (!message) {
    return null;
  }

  const deletedReaction = await MessageReaction.destroy({
    where: {
      messageId: message.id,
      userId: user ? user.id : null,
      userContextUsername: context.username,
      userContextFullName: context.fullName,
      reaction,
    },
  });
  return deletedReaction === 1;
}
