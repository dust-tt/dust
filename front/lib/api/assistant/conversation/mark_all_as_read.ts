import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { Result } from "@app/types";
import { Err, Ok } from "@app/types";

export async function markAllAsRead(
  auth: Authenticator,
  conversationIds: string[]
): Promise<Result<undefined, Error>> {
  const conversations = await ConversationResource.fetchByIds(
    auth,
    conversationIds,
    { includeParticipant: true }
  );

  const conversationsToMarkAsRead = conversations.filter(
    (conversation) =>
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      conversation.userParticipation?.unread ||
      conversation.userParticipation?.actionRequired
  );

  if (conversationsToMarkAsRead.length === 0) {
    return new Err(new Error("No conversations to mark as read"));
  }

  const conversationIdsToMarkAsRead = conversationsToMarkAsRead.map(
    (conversation) => conversation.id
  );

  await ConversationResource.batchMarkAsReadAndClearActionRequired(
    auth,
    conversationIdsToMarkAsRead
  );

  return new Ok(undefined);
}
