import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import { getStaticReplyForUserMessage } from "@app/lib/api/assistant/static_reply";
import type { Authenticator } from "@app/lib/auth";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import type { GlobalAgentContext } from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type {
  ConversationWithoutContentType,
  UserMessageContext,
  UserMessageType,
} from "@app/types/assistant/conversation";

// The turn a global agent is resolved for: the user message its agent message answers (see
// `global-agent-context`).
export function getGlobalAgentContextForTurn({
  conversation,
  userMessage,
}: {
  conversation: ConversationWithoutContentType;
  userMessage: Pick<UserMessageType, "rank" | "content"> & {
    context: Pick<UserMessageContext, "origin">;
  };
}): GlobalAgentContext {
  return {
    userMessageRank: userMessage.rank,
    sidekickIsNewAgentFromScratch:
      conversation.metadata?.sidekickIsNewAgentFromScratch === true ||
      undefined,
    staticReply: getStaticReplyForUserMessage({ conversation, userMessage }),
  };
}

// Callers outside the agent loop (the sandbox) resolve a global agent for the same turn as the
// loop did. Custom agents ignore the context, so the user message is only read for global ones.
export async function getGlobalAgentContextForAgentMessage(
  auth: Authenticator,
  {
    agentId,
    conversation,
    agentMessageId,
  }: {
    agentId: string;
    conversation: ConversationResource;
    agentMessageId: string;
  }
): Promise<GlobalAgentContext | undefined> {
  if (!isGlobalAgentId(agentId)) {
    return undefined;
  }

  const { userMessageId } = await getUserMessageIdFromMessageId(auth, {
    messageId: agentMessageId,
  });
  const messageRes = await conversation.getMessageById(auth, userMessageId);
  if (messageRes.isErr() || !messageRes.value.userMessage) {
    return undefined;
  }
  const { rank, userMessage } = messageRes.value;

  return getGlobalAgentContextForTurn({
    conversation: conversation.toJSON(),
    userMessage: {
      rank,
      content: userMessage.content,
      context: { origin: userMessage.userContextOrigin },
    },
  });
}
