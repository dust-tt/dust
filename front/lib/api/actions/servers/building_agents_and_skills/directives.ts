import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";

export function formatAgentSuggestionDirective(
  suggestion: Pick<
    AgentSuggestionResource,
    "sId" | "kind" | "_agentConfigurationId"
  >
): string {
  return (
    `:agent_suggestion[]{sId=${suggestion.sId} kind=${suggestion.kind} ` +
    `agentId=${suggestion._agentConfigurationId}}`
  );
}

export function formatSkillSuggestionDirective(
  suggestion: Pick<
    SkillSuggestionResource,
    "sId" | "kind" | "skillConfigurationSId"
  >
): string {
  return (
    `:skill_suggestion[]{sId=${suggestion.sId} kind=${suggestion.kind} ` +
    `skillId=${suggestion.skillConfigurationSId}}`
  );
}

export function formatBatchSuggestionDirective(batch: { sId: string }): string {
  return `:batch_edit[]{sId=${batch.sId}}`;
}
