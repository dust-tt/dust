import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionKind } from "@app/types/suggestions/skill_suggestion";
import sortBy from "lodash/sortBy";

const AGENT_SUGGESTION_KIND_RANK: Record<AgentSuggestionKind, number> = {
  create: 0,
  delete: 1,
  name: 2,
  description: 3,
  instructions: 4,
  model: 5,
  skills: 6,
  tools: 7,
  sub_agent: 8,
  knowledge: 9,
  scope: 10,
};

const SKILL_SUGGESTION_KIND_RANK: Record<SkillSuggestionKind, number> = {
  create: 0,
  delete: 1,
  name: 2,
  user_facing_description: 3,
  edit: 4,
  editors: 5,
  availability: 6,
};

export function sortAgentSuggestionsByBuilderOrder<
  T extends { kind: AgentSuggestionKind },
>(suggestions: T[]): T[] {
  return sortBy(suggestions, (s) => AGENT_SUGGESTION_KIND_RANK[s.kind]);
}

export function sortSkillSuggestionsByBuilderOrder<
  T extends { kind: SkillSuggestionKind },
>(suggestions: T[]): T[] {
  return sortBy(suggestions, (s) => SKILL_SUGGESTION_KIND_RANK[s.kind]);
}
