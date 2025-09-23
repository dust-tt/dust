import { enhanceDustDeep } from "@app/lib/api/assistant/global_agents/configurations/dust/dust-deep-enhancer";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentConfigurationType,
  AgentMessageType,
  Result,
  UserMessageContext,
} from "@app/types";
import { GLOBAL_AGENTS_SID, Ok } from "@app/types";

export async function enhanceGlobalAgent(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  agentMessage: AgentMessageType,
  userMessageContext: UserMessageContext
): Promise<Result<AgentConfigurationType, Error>> {
  switch (agentConfiguration.sId) {
    case GLOBAL_AGENTS_SID.DUST_DEEP:
      return enhanceDustDeep(
        auth,
        agentConfiguration,
        agentMessage,
        userMessageContext
      );
    default:
      return new Ok(agentConfiguration);
  }
}
