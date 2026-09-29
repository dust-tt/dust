import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionKind } from "@app/types/suggestions/skill_suggestion";
import sortBy from "lodash/sortBy";

const AGENT_SUGGESTION_KIND_RANK: Record<AgentSuggestionKind, number> = {
  create: 0,
  delete: 1,
  instructions: 2,
  model: 3,
  skills: 4,
  tools: 5,
  sub_agent: 6,
  knowledge: 7,
  name: 8,
  description: 9,
  scope: 10,
};

const SKILL_SUGGESTION_KIND_RANK: Record<SkillSuggestionKind, number> = {
  create: 0,
  delete: 1,
  edit: 2,
  name: 3,
  user_facing_description: 4,
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
