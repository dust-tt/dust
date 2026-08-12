import type { LLMStreamMetadata } from "@app/lib/api/llm/types/options";

export function getPromptCacheKey({
  agentConfigurationId,
  workspaceId,
}: LLMStreamMetadata): string {
  return `${workspaceId}:${agentConfigurationId}`;
}
