import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
  UserMessageTypeWithoutMentions,
} from "@app/types/assistant/conversation";

// Soft assumption that we will not have more than 10 mentions in the same user message.
const MAX_CONCURRENT_AGENT_EXECUTIONS_PER_USER_MESSAGE = 10;

export const runAgentLoopWorkflow = async ({
  auth,
  agentMessages,
  conversation,
  userMessage,
}: {
  auth: Authenticator;
  agentMessages: AgentMessageType[];
  conversation: ConversationWithoutContentType;
  userMessage: UserMessageTypeWithoutMentions;
}) => {
  return concurrentExecutor(
    agentMessages,
    async (agentMessage) => {
      const agentConfiguration = await AgentResource.fetchById(
        auth,
        agentMessage.configuration.sId
      );

      if (!agentConfiguration || !auth.can("read", agentConfiguration)) {
        const completedAt =
          await ConversationResource.cancelUnavailableAgentMessage(auth, {
            conversationId: conversation.sId,
            agentMessageId: agentMessage.sId,
            agentMessageVersion: agentMessage.version,
          });
        return completedAt
          ? {
              ...agentMessage,
              status: "cancelled" as const,
              completedTs: completedAt.getTime(),
            }
          : agentMessage;
      }

      await ConversationResource.setIsRunningAgentLoop(auth, {
        conversation,
        isRunningAgentLoop: true,
      });

      void launchAgentLoopWorkflow({
        auth,
        agentLoopArgs: {
          agentMessageId: agentMessage.sId,
          agentMessageVersion: agentMessage.version,
          conversationId: conversation.sId,
          conversationTitle: conversation.title,
          userMessageId: userMessage.sId,
          userMessageVersion: userMessage.version,
          userMessageOrigin: userMessage.context.origin,
          excludedRetrievalTags: userMessage.context.excludedRetrievalTags,
        },
        // TODO(@id13): Remove this rollout guard once consumption is the only pipeline.
        canInitializeConsumption: true,
        startStep: 0,
      });

      return agentMessage;
    },
    { concurrency: MAX_CONCURRENT_AGENT_EXECUTIONS_PER_USER_MESSAGE }
  );
};
