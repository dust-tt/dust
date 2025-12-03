import assert from "assert";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import { launchAgentLoopWorkflow } from "@app/temporal/agent_loop/client";
import type {
  AgentMessageType,
  ConversationWithoutContentType,
  UserMessageType,
} from "@app/types";

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
  userMessage: UserMessageType;
}) => {
  await concurrentExecutor(
    agentMessages,
    async (agentMessage) => {
      const agentConfiguration = await getAgentConfiguration(auth, {
        agentId: agentMessage.configuration.sId,
        variant: "full",
      });

      assert(
        agentConfiguration,
        "Unreachable: could not find detailed configuration for agent"
      );

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
        },
        startStep: 0,
      });
    },
    { concurrency: MAX_CONCURRENT_AGENT_EXECUTIONS_PER_USER_MESSAGE }
  );
};
