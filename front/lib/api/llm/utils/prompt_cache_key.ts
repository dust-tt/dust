import type { LLMStreamMetadata } from "@app/lib/api/llm/types/options";

export function getOpenAIPromptCacheKey({
  agentConfigurationId,
  workspaceId,
}: LLMStreamMetadata): string {
  return `${workspaceId}:${agentConfigurationId}`;
}
