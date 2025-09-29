import { augmentDustDeep } from "@app/lib/api/assistant/global_agents/configurations/dust/dust-deep-enhancer";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentConfigurationType,
  AgentMessageType,
  Result,
  UserMessageType,
} from "@app/types";
import { GLOBAL_AGENTS_SID, Ok } from "@app/types";

/*
 * Augment the global agent, based on the context.
 * For example, if the agent is dust-deep and has been called by another agent,
 * we augment it with the actions and scope of the custom agent that called it.
 */
export async function augmentGlobalAgent(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  agentMessage: AgentMessageType,
  userMessage: UserMessageType
): Promise<Result<AgentConfigurationType, Error>> {
  switch (agentConfiguration.sId) {
    case GLOBAL_AGENTS_SID.DUST_DEEP:
      return augmentDustDeep(
        auth,
        agentConfiguration,
        agentMessage,
        userMessage
      );
    default:
      return new Ok(agentConfiguration);
  }
}
