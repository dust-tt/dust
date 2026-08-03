import type { Authenticator } from "@app/lib/auth";
import { MessageModel } from "@app/lib/models/agent/conversation";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { Transaction } from "sequelize";

export async function getNextConversationMessageRank(
  auth: Authenticator,
  {
    conversation,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    transaction: Transaction;
  }
): Promise<number> {
  const owner = auth.getNonNullableWorkspace();

  return (
    ((await MessageModel.max<number | null, MessageModel>("rank", {
      where: {
        workspaceId: owner.id,
        conversationId: conversation.id,
      },
      transaction,
    })) ?? -1) + 1
  );
}
