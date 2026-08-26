import { renderMessagesForCheckpoint } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { ConversationType } from "@app/types/assistant/conversation";
import { ConversationError } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

/**
 * Fetches the bounded conversation projection used to restore or extend an agent-loop checkpoint.
 * It loads the requested user and agent messages directly, includes agent state completed before
 * `targetStep`, and hydrates tool output content only for the latest completed step.
 */
export async function getConversationForCheckpoint(
  auth: Authenticator,
  conversationId: string,
  {
    agentMessageId,
    targetStep,
    userMessageId,
  }: {
    agentMessageId: string;
    targetStep: number;
    userMessageId: string;
  }
): Promise<Result<ConversationType, ConversationError>> {
  const conversation = await ConversationResource.fetchById(
    auth,
    conversationId,
    { includeForkingData: true }
  );
  if (!conversation) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  const messages = await ConversationResource.getMessageByIds(
    auth,
    conversation,
    [userMessageId, agentMessageId]
  );
  const renderedMessages = await renderMessagesForCheckpoint(auth, messages, {
    agentMessageId,
    targetStep,
    userMessageId,
  });
  if (renderedMessages.isErr()) {
    return renderedMessages;
  }

  const { agentMessage, userMessage } = renderedMessages.value;
  const content: ConversationType["content"] = [
    [userMessage],
    [agentMessage],
  ].sort((a, b) => a[0].rank - b[0].rank);

  return new Ok({
    ...conversation.toJSON(),
    owner: auth.getNonNullableWorkspace(),
    visibility: conversation.visibility,
    content,
  });
}
