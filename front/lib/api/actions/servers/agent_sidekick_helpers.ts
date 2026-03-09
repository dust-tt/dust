import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getSidekickMetadataFromContext } from "@app/lib/api/actions/servers/helpers";

export function getAgentConfigurationIdFromContext(
  agentLoopContext?: AgentLoopContextType
): string | null {
  return (
    getSidekickMetadataFromContext(agentLoopContext)
      ?.sidekickTargetAgentConfigurationId ?? null
  );
}

export function getAgentConfigurationVersionFromContext(
  agentLoopContext?: AgentLoopContextType
): number | null {
  return (
    getSidekickMetadataFromContext(agentLoopContext)
      ?.sidekickTargetAgentConfigurationVersion ?? null
  );
}
