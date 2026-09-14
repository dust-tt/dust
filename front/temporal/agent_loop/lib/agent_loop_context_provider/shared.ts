import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import { sliceConversationForAgentMessage } from "@app/temporal/agent_loop/lib/loop_utils";
import type {
  AgentLoopExecutionData,
  AgentLoopRuntimeData,
} from "@app/types/assistant/agent_run";
import type { ConversationType } from "@app/types/assistant/conversation";
import { isAgentMessageType } from "@app/types/assistant/conversation";

export function getMissingActionCatcherFunctionCallIds(
  conversation: ConversationType
): string[] {
  const functionCallIds = new Set<string>();
  const missingActionCatcherMCPServerId = autoInternalMCPServerNameToSId({
    name: "missing_action_catcher",
    workspaceId: conversation.owner.id,
  });

  for (const messageVersions of conversation.content) {
    for (const message of messageVersions) {
      if (!isAgentMessageType(message)) {
        continue;
      }

      for (const action of message.actions) {
        if (action.mcpServerId === missingActionCatcherMCPServerId) {
          functionCallIds.add(action.functionCallId);
        }
      }
    }
  }

  return [...functionCallIds];
}

export function prepareRuntimeData(
  data: AgentLoopExecutionData,
  step: number
): {
  conversation: ConversationType;
  runtimeData: AgentLoopRuntimeData;
} {
  const fullConversation = structuredClone(data.conversation);
  const { slicedConversation, slicedAgentMessage } =
    sliceConversationForAgentMessage(fullConversation, {
      agentMessageId: data.agentMessage.sId,
      agentMessageVersion: data.agentMessage.version,
      step,
    });
  const { content: _content, ...conversation } = slicedConversation;

  return {
    conversation: slicedConversation,
    runtimeData: {
      agentConfiguration: data.agentConfiguration,
      modelInfo: data.modelInfo,
      agentMessage: structuredClone(slicedAgentMessage),
      conversation,
      userMessage: data.userMessage,
    },
  };
}
