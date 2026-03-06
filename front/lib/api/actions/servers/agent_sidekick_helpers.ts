import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getCopilotMetadataFromContext } from "@app/lib/api/actions/servers/helpers";

export function getAgentConfigurationIdFromContext(
  agentLoopContext?: AgentLoopContextType
): string | null {
  return (
    getCopilotMetadataFromContext(agentLoopContext)
      ?.copilotTargetAgentConfigurationId ?? null
  );
}

export function getAgentConfigurationVersionFromContext(
  agentLoopContext?: AgentLoopContextType
): number | null {
  return (
    getCopilotMetadataFromContext(agentLoopContext)
      ?.copilotTargetAgentConfigurationVersion ?? null
  );
}
