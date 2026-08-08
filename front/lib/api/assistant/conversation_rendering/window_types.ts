import type { InteractionWithTokens } from "@app/lib/api/assistant/conversation_rendering/pruning";

export type ConversationPruningStats = {
  totalTokensBefore: number;
  totalTokensAfterPruning: number;
  pruningBudget: number;
  budgetForInteractions: number;
  prunedImageCount: number;
};

export type ConversationWindowResult = {
  interactions: InteractionWithTokens[];
  prunedContext: boolean;
  stats: ConversationPruningStats;
};
