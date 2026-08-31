/**
 * Datadog instrumentation for conversation pruning. The pruning code itself only produces
 * ConversationPruningStats as plain data. This module derives the metrics from that data and is
 * the only file here that talks to StatsD, so the decision logic stays free of I/O and tests can
 * assert on data instead of mocking a metrics client.
 */

import type { ConversationPruningStats } from "@app/lib/api/assistant/conversation_rendering/window_types";
import { statsDMetrics } from "@app/lib/utils/statsd";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";

export type { ConversationPruningStats } from "@app/lib/api/assistant/conversation_rendering/window_types";

type ConversationRenderingOutcome = "fits" | "pruned";

type ConversationRenderingMetrics = {
  outcome: ConversationRenderingOutcome;
  // True when the rendered context remains above the proactive pruning budget. This can happen
  // because the remaining tool results are pending, less than one pruning checkpoint is eligible,
  // or non-tool history alone exceeds the budget.
  saturated: boolean;
  overBudget: boolean;
  tokensOverBudget: number;
  prunedTokens: number;
};

export function computeConversationRenderingMetrics(
  stats: ConversationPruningStats
): ConversationRenderingMetrics {
  const prunedTokens = stats.totalTokensBefore - stats.totalTokensAfterPruning;
  const tokensOverBudget = Math.max(
    stats.totalTokensAfterPruning - stats.budgetForInteractions,
    0
  );

  return {
    outcome: prunedTokens > 0 ? "pruned" : "fits",
    saturated: stats.totalTokensAfterPruning > stats.pruningBudget,
    overBudget: tokensOverBudget > 0,
    tokensOverBudget,
    prunedTokens,
  };
}

// renderConversationForModel has several callers with different budgets (the agent loop, Dust
// app history injection, reinforcement batches, operator scripts). Mixing them into one series
// would skew the outcome and saturation distributions, so emission is opt-in: callers that want
// their renders measured pass a caller name, everyone else emits nothing.
export type ConversationRenderingMetricsCaller = "agent_loop";

export function emitConversationRenderingMetrics({
  stats,
  caller,
  providerId,
  modelId,
  contextSize,
  tokensUsed,
}: {
  stats: ConversationPruningStats;
  caller: ConversationRenderingMetricsCaller;
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  contextSize: number;
  tokensUsed: number;
}): void {
  const metrics = computeConversationRenderingMetrics(stats);
  const statsD = statsDMetrics;
  const baseTags = [
    `client_id:${providerId}`,
    `model_id:${modelId}`,
    `caller:${caller}`,
    `over_budget:${metrics.overBudget}`,
  ];

  statsD.increment("conversation_rendering.renders", 1, [
    ...baseTags,
    `outcome:${metrics.outcome}`,
    `saturated:${metrics.saturated}`,
  ]);

  if (contextSize > 0) {
    statsD.distribution(
      "conversation_rendering.context_utilization",
      tokensUsed / contextSize,
      baseTags
    );
  }

  if (metrics.prunedTokens > 0) {
    statsD.distribution(
      "conversation_rendering.pruned_tokens",
      metrics.prunedTokens,
      [...baseTags, "layer:proactive"]
    );
  }
  if (metrics.tokensOverBudget > 0) {
    statsD.distribution(
      "conversation_rendering.tokens_over_budget",
      metrics.tokensOverBudget,
      baseTags
    );
  }
}

// Failed renders never reach the success emission above. This counter pairs with the renders
// counter the way llm_error.count pairs with llm_success.count.
export function emitConversationRenderingError({
  kind,
  caller,
  providerId,
  modelId,
}: {
  kind: "context_overflow" | "no_messages";
  caller: ConversationRenderingMetricsCaller;
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
}): void {
  statsDMetrics.increment("conversation_rendering.errors", 1, [
    `client_id:${providerId}`,
    `model_id:${modelId}`,
    `caller:${caller}`,
    `kind:${kind}`,
  ]);
}
