import type {
  AgentActionEvent,
  AgentActionSuccessEvent,
  AgentConfigurationType,
  AgentErrorEvent,
  AgentGenerationCancelledEvent,
  AgentGenerationSuccessEvent,
  AgentMessageSuccessEvent,
  AgentMessageType,
  ConversationType,
  GenerationTokensEvent,
  LightAgentConfigurationType,
  UserMessageType,
} from "@dust-tt/types";
import { removeNulls } from "@dust-tt/types";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
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
  | AgentMessageSuccessEvent,
  void
> {
  const fullConfiguration = await getAgentConfiguration(
    auth,
    configuration.sId
  );
  if (!fullConfiguration) {
    throw new Error(
      `Unreachable: could not find detailed configuration for agent ${configuration.sId}`
    );
  }
  if (isLegacyAgent(fullConfiguration)) {
    for await (const event of runLegacyAgent(
      auth,
      fullConfiguration,
      conversation,
      userMessage,
      agentMessage
    )) {
      yield event;
    }
  } else {
    throw new Error("Multi-actions agents are not supported yet.");
  }
}

// This function returns true if the agent is a "legacy" agent with a forced schedule,
// i.e it has a maxToolsUsePerRun <= 2, every possible iteration has a forced action,
// and every tool is forced at a certain iteration.
function isLegacyAgent(configuration: AgentConfigurationType): boolean {
  // TODO(@fontanierh): change once generation is part of actions.
  const actions = removeNulls([
    ...configuration.actions,
    configuration.generation,
  ]);

  return (
    configuration.maxToolsUsePerRun <= 2 &&
    Array.from(Array(configuration.maxToolsUsePerRun).keys()).every((i) =>
      actions.some((a) => a.forceUseAtIteration === i)
    ) &&
    actions.every((a) => a.forceUseAtIteration !== undefined)
  );
}
