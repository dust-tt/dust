import type { AgentSuggestionKind } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionKind } from "@app/types/suggestions/skill_suggestion";
import sortBy from "lodash/sortBy";

// Compiles only when the order lists every kind.
type ListsEveryKind<Kind, Order extends readonly Kind[]> =
  Exclude<Kind, Order[number]> extends never ? true : never;

const AGENT_SUGGESTION_KIND_ORDER = [
  "create",
  "delete",
  "name",
  "description",
  "instructions",
  "model",
  "skills",
  "tools",
  "sub_agent",
  "knowledge",
  "tags",
  "editors",
  "scope",
] as const satisfies readonly AgentSuggestionKind[];

const SKILL_SUGGESTION_KIND_ORDER = [
  "create",
  "delete",
  "name",
  "user_facing_description",
  "edit",
  "editors",
  "availability",
] as const satisfies readonly SkillSuggestionKind[];

const _agentOrderListsEveryKind: ListsEveryKind<
  AgentSuggestionKind,
  typeof AGENT_SUGGESTION_KIND_ORDER
> = true;
const _skillOrderListsEveryKind: ListsEveryKind<
  SkillSuggestionKind,
  typeof SKILL_SUGGESTION_KIND_ORDER
> = true;

export function sortAgentSuggestionsByBuilderOrder<
  T extends { kind: AgentSuggestionKind },
>(suggestions: T[]): T[] {
  return sortBy(suggestions, (s) =>
    AGENT_SUGGESTION_KIND_ORDER.indexOf(s.kind)
  );
}

export function sortSkillSuggestionsByBuilderOrder<
  T extends { kind: SkillSuggestionKind },
>(suggestions: T[]): T[] {
  return sortBy(suggestions, (s) =>
    SKILL_SUGGESTION_KIND_ORDER.indexOf(s.kind)
  );
}
