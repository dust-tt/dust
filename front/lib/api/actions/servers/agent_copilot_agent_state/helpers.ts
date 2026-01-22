import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import {
  AGENT_CONFIGURATION_ID_KEY,
  AGENT_CONFIGURATION_VERSION_KEY,
} from "@app/lib/api/actions/servers/agent_copilot_agent_state/metadata";

export function getAgentConfigurationIdFromContext(
  agentLoopContext?: AgentLoopContextType
): string | null {
  if (
    agentLoopContext?.runContext &&
    isLightServerSideMCPToolConfiguration(
      agentLoopContext.runContext.toolConfiguration
    )
  ) {
    const value =
      agentLoopContext.runContext.toolConfiguration.additionalConfiguration[
        AGENT_CONFIGURATION_ID_KEY
      ];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

export function getAgentConfigurationVersionFromContext(
  agentLoopContext?: AgentLoopContextType
): number | null {
  if (
    agentLoopContext?.runContext &&
    isLightServerSideMCPToolConfiguration(
      agentLoopContext.runContext.toolConfiguration
    )
  ) {
    const value =
      agentLoopContext.runContext.toolConfiguration.additionalConfiguration[
        AGENT_CONFIGURATION_VERSION_KEY
      ];
    if (typeof value === "number") {
      return value;
    }
  }
  return null;
}
