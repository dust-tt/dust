import { Authenticator } from "@app/lib/auth";
import { ModelId } from "@app/lib/databases";
import { Message, MessageReaction } from "@app/lib/models";
import { MessageReactionType } from "@app/types/assistant/conversation";

export async function addOrRemoveMessageReaction(
  auth: Authenticator,
  {
    messageId,
    userId,
    userContextUsername,
    userContextFullName,
    reaction,
  }: {
    messageId: string;
    userId: ModelId;
    userContextUsername: string;
    userContextFullName: string | null;
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

  const existingReaction = await MessageReaction.findOne({
    where: {
      messageId: message.id,
      userId,
      reaction,
    },
  });
  if (existingReaction) {
    await existingReaction.destroy();
    return true;
  }

  const r = await MessageReaction.create({
    messageId: message.id,
    userId,
    userContextUsername,
    userContextFullName,
    reaction,
  });
  return r !== null;
}

export function renderMessageReactions(
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
