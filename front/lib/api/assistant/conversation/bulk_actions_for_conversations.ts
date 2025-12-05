import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

interface MarkAllAsReadResult {
  failedConversationCount: number;
}

export async function markAllAsRead(
  auth: Authenticator,
  { conversationIds }: { conversationIds: string[] }
): Promise<Result<MarkAllAsReadResult, Error>> {
  const conversations = await ConversationResource.fetchByIds(
    auth,
    conversationIds,
    { includeParticipant: true }
  );

  const conversationsToMarkAsRead = conversations.filter((conversation) => {
    const participation = conversation.getUserParticipation();
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    return participation?.unread || participation?.actionRequired;
  });

  if (conversationsToMarkAsRead.length === 0) {
    return new Err(new Error("No conversations to mark as read"));
  }

  const conversationIdsToMarkAsRead = conversationsToMarkAsRead.map(
    (conversation) => conversation.id
  );

  const updatedConversationCount =
    await ConversationResource.batchMarkAsReadAndClearActionRequired(
      auth,
      conversationIdsToMarkAsRead
    );

  const failedConversationCount =
    conversationIds.length - updatedConversationCount;

  return new Ok({
    failedConversationCount,
  });
}
