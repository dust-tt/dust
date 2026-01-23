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
