import { Authenticator } from "@app/lib/auth";
import { ModelId } from "@app/lib/databases";
import { Message, MessageReaction } from "@app/lib/models";
import {
  ConversationMessageReactions,
  MessageReactionType,
} from "@app/types/assistant/conversation";

/**
 * We retrieve the reactions for a whole conversation, not just a single message.
 */
export async function getMessageReactions(
  auth: Authenticator,
  conversationId: ModelId
): Promise<ConversationMessageReactions | null> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const messages = await Message.findAll({
    where: {
      conversationId: conversationId,
    },
    include: [
      {
        model: MessageReaction,
        as: "reactions",
        required: false,
      },
    ],
  });

  return messages.map((m) => ({
    messageId: m.sId,
    reactions: _renderMessageReactions(m.reactions || []),
  }));
}

function _renderMessageReactions(
  reactions: MessageReaction[]
): MessageReactionType[] {
  return reactions.reduce<MessageReactionType[]>((acc, r) => {
    const reaction = acc.find((r2) => r2.emoji === r.reaction);
    if (reaction) {
      reaction.users.push({
        username: r.userContextUsername,
        fullName: r.userContextFullName,
      });
    } else {
      acc.push({
        emoji: r.reaction,
        users: [
          {
            username: r.userContextUsername,
            fullName: r.userContextFullName,
          },
        ],
      });
    }
    return acc;
  }, []);
}

/**
 * We create a reaction for a single message.
 * As user can be null (user from Slack), we also store the user context, as we do for messages.
 */
export async function createMessageReaction(
  auth: Authenticator,
  {
    messageId,
    userId,
    context,
    reaction,
  }: {
    messageId: string;
    userId: ModelId | null;
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
    },
  });

  if (!message) {
    return null;
  }

  const newReaction = await MessageReaction.create({
    messageId: message.id,
    userId,
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
    userId,
    context,
    reaction,
  }: {
    messageId: string;
    userId: ModelId | null;
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
    },
  });

  if (!message) {
    return null;
  }

  const deletedReaction = await MessageReaction.destroy({
    where: {
      messageId: message.id,
      userId,
      userContextUsername: context.username,
      userContextFullName: context.fullName,
      reaction,
    },
  });
  return deletedReaction === 1;
}
