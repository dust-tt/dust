import type { AgentLoopContextType } from "@app/lib/actions/types";

export function getAgentConfigurationIdFromContext(
  agentLoopContext?: AgentLoopContextType
): string | null {
  const metadata =
    agentLoopContext?.runContext?.conversation.metadata ??
    agentLoopContext?.listToolsContext?.conversation.metadata;

  return metadata?.agentCopilot?.targetAgentConfigurationId ?? null;
}
