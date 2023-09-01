import { Authenticator } from "@app/lib/auth";
import { generateModelSId } from "@app/lib/utils";
import {
  AgentActionConfigurationType,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentMessageConfigurationType,
} from "@app/types/assistant/configuration";
import {
  AssistantAgentActionType,
  AssistantAgentMessageType,
  AssistantConversationType,
} from "@app/types/assistant/conversation";

export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    action,
    message,
  }: {
    name: string;
    action?: AgentActionConfigurationType;
    message?: AgentMessageConfigurationType;
  }
): Promise<AgentConfigurationType> {
  return {
    sId: generateModelSId(),
    name,
    status: "active",
  };
}

export async function updateAgentConfiguration(
  auth: Authenticator,
  configurationId: string,
  {
    name,
    status,
    action,
    message,
  }: {
    name: string;
    status: AgentConfigurationStatus;
    action?: AgentActionConfigurationType;
    message?: AgentMessageConfigurationType;
  }
): Promise<AgentConfigurationType> {
  return {
    sId: generateModelSId(),
    name,
    status,
  };
}

export async function runAgent(
  auth: Authenticator,
  configurationId: string,
  conversation: AssistantConversationType
): Promise<AssistantAgentMessageType> {
  return {
    id: 0,
    sId: generateModelSId(),
    status: "visible",
    feedbacks: [],
  };
}
