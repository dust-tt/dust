import type {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  ConversationType,
  DustAppRunBlockEvent,
  DustAppRunParamsEvent,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  RetrievalParamsEvent,
  TablesQueryOutputEvent,
  TablesQueryParamsEvent,
  UserMessageType,
} from "@dust-tt/types";

import { runLegacyAgent } from "@app/lib/api/assistant/legacy_agent";
import type { Authenticator } from "@app/lib/auth";

// This interface is used to execute an agent. It is not in charge of creating the AgentMessage,
// nor updating it (responsability of the caller based on the emitted events).
export async function* runAgent(
  auth: Authenticator,
  configuration: LightAgentConfigurationType,
  conversation: ConversationType,
  userMessage: UserMessageType,
  agentMessage: AgentMessageType
): AsyncGenerator<
  | AgentErrorEvent
  | AgentActionEvent
  | AgentActionSuccessEvent
  | GenerationTokensEvent
  | AgentGenerationSuccessEvent
  | AgentGenerationCancelledEvent
  | AgentMessageSuccessEvent
  | RetrievalParamsEvent
  | DustAppRunParamsEvent
  | DustAppRunBlockEvent
  | TablesQueryParamsEvent
  | TablesQueryOutputEvent,
  void
> {
  // TODO(multi-actions): Implement isLegacyAgent and fork execution here.

  for await (const event of runLegacyAgent(
    auth,
    configuration,
    conversation,
    userMessage,
    agentMessage
  )) {
    yield event;
  }
}
