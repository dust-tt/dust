import { getMainAgent } from "@app/lib/api/assistant/global_agents/configurations/dust/augment-dust-deep";
import { replaceCompanyDataActions } from "@app/lib/api/assistant/global_agents/configurations/dust/augment-dust-deep-2";
import { fetchMessage } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import {
  ConversationModel,
  Message,
  UserMessage,
} from "@app/lib/models/assistant/conversation";
import type {
  AgentConfigurationType,
  AgentMessageType,
  Result,
  UserMessageType,
} from "@app/types";
import { Err, Ok } from "@app/types";

export async function augmentDustTask(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  agentMessage: AgentMessageType,
  userMessage: UserMessageType
): Promise<Result<AgentConfigurationType, Error>> {
  const deepMessageId = userMessage.context.originMessageId;
  const deepMessage = deepMessageId
    ? await fetchMessage(auth, deepMessageId)
    : null;
  const userMessageId = deepMessage?.parentId;
  if (userMessageId) {
    // Get the real user message
    const rootUserMessage = await Message.findByPk(userMessageId, {
      include: [
        {
          model: UserMessage,
          as: "userMessage",
          required: false,
        },
        {
          model: ConversationModel,
          as: "conversation",
        },
      ],
    });
    if (rootUserMessage) {
      const mainAgent = await getMainAgent(
        auth,
        rootUserMessage.userMessage?.userContextOriginMessageId
      );
      if (!mainAgent) {
        return new Ok(agentConfiguration);
      }

      await replaceCompanyDataActions(auth, agentConfiguration, mainAgent);
    } else {
      return new Err(new Error("Root user message not found"));
    }
  }

  return new Ok(agentConfiguration);
}
