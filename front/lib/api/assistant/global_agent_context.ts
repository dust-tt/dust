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
// loop did: the user message version the agent message answers (its `parentId` row). Custom agents
// ignore the context, so the user message is only read for global ones. A missing message resolves
// no context rather than failing: the caller reports it when it reads the agent message itself.
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

  const agentMessageRes = await conversation.getMessageById(
    auth,
    agentMessageId
  );
  const parentId = agentMessageRes.isOk()
    ? agentMessageRes.value.parentId
    : null;
  if (!parentId) {
    return undefined;
  }
  const [message] = await conversation.fetchMessagesByModelIds(auth, [
    parentId,
  ]);
  if (!message?.userMessage) {
    return undefined;
  }

  return getGlobalAgentContextForTurn({
    conversation: conversation.toJSON(),
    userMessage: {
      rank: message.rank,
      content: message.userMessage.content,
      context: { origin: message.userMessage.userContextOrigin },
    },
  });
}
