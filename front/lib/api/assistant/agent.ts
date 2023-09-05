import { Authenticator } from "@app/lib/auth";
import { generateModelSId } from "@app/lib/utils";
import {
  AgentActionConfigurationType,
  AgentActionInputsSpecification,
  AgentConfigurationStatus,
  AgentConfigurationType,
  AgentMessageConfigurationType,
} from "@app/types/assistant/agent";
import {
  AssistantAgentActionType,
  AssistantAgentMessageType,
  AssistantConversationType,
} from "@app/types/assistant/conversation";

import {
  RetrievalDocumentsEvent,
  RetrievalParamsEvent,
} from "./actions/retrieval";

/**
 * Agent configuration.
 */

export async function createAgentConfiguration(
  auth: Authenticator,
  {
    name,
    pictureUrl,
    action,
    message,
  }: {
    name: string;
    pictureUrl?: string;
    action?: AgentActionConfigurationType;
    message?: AgentMessageConfigurationType;
  }
): Promise<AgentConfigurationType> {
  return {
    sId: generateModelSId(),
    name,
    pictureUrl: pictureUrl ?? null,
    status: "active",
    action: action ?? null,
    message: message ?? null,
  };
}

export async function updateAgentConfiguration(
  auth: Authenticator,
  configurationId: string,
  {
    name,
    pictureUrl,
    status,
    action,
    message,
  }: {
    name: string;
    pictureUrl?: string;
    status: AgentConfigurationStatus;
    action?: AgentActionConfigurationType;
    message?: AgentMessageConfigurationType;
  }
): Promise<AgentConfigurationType> {
  return {
    sId: generateModelSId(),
    name,
    pictureUrl: pictureUrl ?? null,
    status,
    action: action ?? null,
    message: message ?? null,
  };
}

/**
 * Action Inputs generation.
 */

// This method is used by actions to generate its inputs if needed.
export async function generateActionInputs(
  auth: Authenticator,
  specification: AgentActionInputsSpecification
): Promise<Record<string, string | boolean | number>> {
  return {};
}

/**
 * Agent execution.
 */

// Event sent when a new message is created (empty) and the agent is about to be executed.
export type AgentMessageNewEvent = {
  type: "agent_message_new";
  created: number;
  configurationId: string;
  message: AssistantAgentMessageType;
};

// Generic event sent when an error occured (whether it's during the action or the message generation).
export type AgentErrorEvent = {
  type: "agent_error";
  created: number;
  configurationId: string;
  messageId: string;
  error: {
    code: string;
    message: string;
  };
};

// Event sent durint the execution of an action. These are action specific.
export type AgentActionEvent = RetrievalParamsEvent | RetrievalDocumentsEvent;

// Event sent once the action is completed, we're moving to generating a message if applicable.
export type AgentActionSuccessEvent = {
  type: "agent_action_success";
  created: number;
  configurationId: string;
  messageId: string;
  action: AssistantAgentActionType;
};

// Event sent when tokens are streamed as the the agent is generating a message.
export type AgentMessageTokensEvent = {
  type: "agent_message_tokens";
  created: number;
  configurationId: string;
  messageId: string;
  text: string;
};

// Event sent once the message is completed and successful.
export type AgentMessageSuccessEvent = {
  type: "agent_message_success";
  created: number;
  configurationId: string;
  messageId: string;
  message: AssistantAgentMessageType;
};

// This interface is used to execute an agent. It is in charge of creating the AssistantAgentMessage
// object in database (fully completed or with error set if an error occured). It is called to run
// an agent or when retrying a previous agent interaction.
export async function* runAgent(
  auth: Authenticator,
  configuration: AgentConfigurationType,
  conversation: AssistantConversationType
): AsyncGenerator<
  | AgentMessageNewEvent
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | AgentMessageTokensEvent
  | AgentMessageSuccessEvent
> {
  yield {
    type: "agent_error",
    created: Date.now(),
    configurationId: configuration.sId,
    messageId: generateModelSId(),
    error: {
      code: "not_implemented",
      message: "Not implemented",
    },
  };
}
