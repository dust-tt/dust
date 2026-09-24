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
