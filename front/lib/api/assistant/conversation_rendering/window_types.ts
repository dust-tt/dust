import type { InteractionWithTokens } from "@app/lib/api/assistant/conversation_rendering/pruning";

export type ConversationWindowStrategy = "legacy" | "checkpointed";

export type ConversationPruningStats = {
  totalTokensBefore: number;
  totalTokensAfterPruning: number;
  totalTokensAfterDropping: number;
  totalTokensAfterFloorPruning: number;
  totalTokensAfterFloorDropping: number;
  interactionsBefore: number;
  interactionsAfterDropping: number;
  interactionsAfterFloorDropping: number;
  pruningBudget: number;
  budgetForInteractions: number;
};

export type ConversationWindowResult = {
  interactions: InteractionWithTokens[];
  prunedContext: boolean;
  stats: ConversationPruningStats;
};
