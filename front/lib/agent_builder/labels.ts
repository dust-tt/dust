import type { AgentConfigurationScope } from "@app/types/assistant/agent";

export function getAgentScopeLabel(scope: AgentConfigurationScope): string {
  return scope === "visible" ? "Published" : "Unpublished";
}
