import type { AgentSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type { SkillSuggestionType } from "@app/types/suggestions/skill_suggestion";

export const BATCH_SUGGESTION_STATES = [
  "pending",
  "approved",
  "rejected",
  "outdated",
] as const;

export type BatchSuggestionState = (typeof BATCH_SUGGESTION_STATES)[number];

/** Light batch suggestion type with only the ids of sub-suggestion. */
export interface LightBatchSuggestionType {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string | null;
  analysis: string | null;
  state: BatchSuggestionState;
  sourceConversationId: string | null;
  agentSuggestionIds: string[];
  skillSuggestionIds: string[];
}

export interface BatchSuggestionType
  extends Omit<
    LightBatchSuggestionType,
    "agentSuggestionIds" | "skillSuggestionIds"
  > {
  agentSuggestions: AgentSuggestionType[];
  skillSuggestions: SkillSuggestionType[];
}
