import type { Authenticator } from "@app/lib/auth";
import {
  MessageModel,
  MessageReactionModel,
} from "@app/lib/models/agent/conversation";
import { UserModel } from "@app/lib/resources/storage/models/user";
import type {
  ConversationError,
  ConversationMessageReactions,
  ConversationWithoutContentType,
  MessageReactionType,
  Result,
} from "@app/types";
import type { UserType } from "@app/types";
import { Ok } from "@app/types";

/**
 * We retrieve the reactions for a whole conversation, not just a single message.
 */
export async function getMessageReactions(
  auth: Authenticator,
  conversation: ConversationWithoutContentType
): Promise<Result<ConversationMessageReactions, ConversationError>> {
  const owner = auth.workspace();
  if (!owner) {
    throw new Error("Unexpected `auth` without `workspace`.");
  }

  const messages = await MessageModel.findAll({
    where: {
      workspaceId: owner.id,
      conversationId: conversation.id,
    },
    attributes: ["sId"],
    include: [
      {
        model: MessageReactionModel,
        as: "reactions",
        required: false,
        include: [
          {
            model: UserModel,
            as: "user",
            attributes: ["sId", "firstName", "lastName", "username"],
            required: true,
          },
        ],
      },
    ],
  });

  return new Ok(
    messages.map((m) => ({
      messageId: m.sId,
      reactions: _renderMessageReactions(m.reactions ?? []),
    }))
  );
}

function _renderMessageReactions(
  reactions: MessageReactionModel[]
): MessageReactionType[] {
  return reactions.reduce<MessageReactionType[]>(
    (acc: MessageReactionType[], r: MessageReactionModel) => {
      if (!r.user) {
        return acc;
      }

      const userData = {
        userId: r.user.sId,
        username: r.user.username,
        fullName: r.user.firstName + " " + r.user.lastName,
      };

      const reaction = acc.find((r2) => r2.emoji === r.reaction);
      if (reaction) {
        reaction.users.push(userData);
      } else {
        acc.push({ emoji: r.reaction, users: [userData] });
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
    conversation: ConversationWithoutContentType;
    user: UserType | null;
    context: {
      username: string;
      fullName: string | null;
    };
    reaction: string;
  }
): Promise<boolean | null> {
  const owner = auth.getNonNullableWorkspace();

  const message = await MessageModel.findOne({
    where: {
      sId: messageId,
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
  });

  if (!message) {
    return null;
  }

  const newReaction = await MessageReactionModel.create({
    messageId: message.id,
    userId: user ? user.id : null,
    userContextUsername: context.username,
    userContextFullName: context.fullName,
    reaction,
    workspaceId: owner.id,
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
    conversation: ConversationWithoutContentType;
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

  const message = await MessageModel.findOne({
    where: {
      sId: messageId,
      conversationId: conversation.id,
      workspaceId: owner.id,
    },
  });

  if (!message) {
    return null;
  }

  const deletedReaction = await MessageReactionModel.destroy({
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
