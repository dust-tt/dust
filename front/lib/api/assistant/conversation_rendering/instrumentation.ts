/**
 * Datadog instrumentation for conversation pruning. The pruning code itself only produces
 * ConversationPruningStats as plain data. This module derives the metrics from that data and is
 * the only file here that talks to StatsD, so the decision logic stays free of I/O and tests can
 * assert on data instead of mocking a metrics client.
 */

import type {
  ConversationPruningStats,
  ConversationWindowStrategy,
} from "@app/lib/api/assistant/conversation_rendering/window_types";
import { getStatsDClient } from "@app/lib/utils/statsd";
import type {
  ModelIdType,
  ModelProviderIdType,
} from "@app/types/assistant/models/types";

// Token totals and interaction counts snapshotted after each escalation layer, plus the budgets
// the layers ran against. Layers that did nothing leave their snapshot equal to the previous one.
export type { ConversationPruningStats } from "@app/lib/api/assistant/conversation_rendering/window_types";

export type ConversationRenderingOutcome =
  | "fits"
  | "pruned"
  | "dropped"
  | "floor_pruned"
  | "floor_dropped";

export type ConversationRenderingMetrics = {
  // The deepest escalation layer that changed anything.
  outcome: ConversationRenderingOutcome;
  // True when the rendered context remains above the proactive pruning budget. This can happen
  // because the remaining tool results are pending, less than one pruning checkpoint is eligible,
  // or non-tool history alone exceeds the budget.
  saturated: boolean;
  overBudget: boolean;
  tokensOverBudget: number;
  prunedTokens: number;
  floorPrunedTokens: number;
  droppedTokens: number;
  floorDroppedTokens: number;
  droppedInteractions: number;
  floorDroppedInteractions: number;
  // Headroom below the hard budget right after the batched drop. Small slack means the next
  // drop, and its full cache miss, comes soon.
  dropSlackTokens: number | null;
};

export function computeConversationRenderingMetrics(
  stats: ConversationPruningStats
): ConversationRenderingMetrics {
  const prunedTokens = stats.totalTokensBefore - stats.totalTokensAfterPruning;
  const droppedTokens =
    stats.totalTokensAfterPruning - stats.totalTokensAfterDropping;
  const floorPrunedTokens =
    stats.totalTokensAfterDropping - stats.totalTokensAfterFloorPruning;
  const floorDroppedTokens =
    stats.totalTokensAfterFloorPruning - stats.totalTokensAfterFloorDropping;
  const droppedInteractions =
    stats.interactionsBefore - stats.interactionsAfterDropping;
  const floorDroppedInteractions =
    stats.interactionsAfterDropping - stats.interactionsAfterFloorDropping;
  const tokensOverBudget = Math.max(
    stats.totalTokensAfterFloorDropping - stats.budgetForInteractions,
    0
  );

  let outcome: ConversationRenderingOutcome = "fits";
  if (prunedTokens > 0) {
    outcome = "pruned";
  }
  if (droppedTokens > 0) {
    outcome = "dropped";
  }
  if (floorPrunedTokens > 0) {
    outcome = "floor_pruned";
  }
  if (floorDroppedTokens > 0) {
    outcome = "floor_dropped";
  }

  return {
    outcome,
    saturated: stats.totalTokensAfterPruning > stats.pruningBudget,
    overBudget: tokensOverBudget > 0,
    tokensOverBudget,
    prunedTokens,
    floorPrunedTokens,
    droppedTokens,
    floorDroppedTokens,
    droppedInteractions,
    floorDroppedInteractions,
    dropSlackTokens:
      droppedTokens > 0
        ? stats.budgetForInteractions - stats.totalTokensAfterDropping
        : null,
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
  windowStrategy,
}: {
  stats: ConversationPruningStats;
  caller: ConversationRenderingMetricsCaller;
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  contextSize: number;
  tokensUsed: number;
  windowStrategy: ConversationWindowStrategy;
}): void {
  const metrics = computeConversationRenderingMetrics(stats);
  const statsD = getStatsDClient();
  const baseTags = [
    `client_id:${providerId}`,
    `model_id:${modelId}`,
    `caller:${caller}`,
    `window_strategy:${windowStrategy}`,
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
  if (metrics.floorPrunedTokens > 0) {
    statsD.distribution(
      "conversation_rendering.pruned_tokens",
      metrics.floorPrunedTokens,
      [...baseTags, "layer:floor"]
    );
  }
  if (metrics.droppedTokens > 0) {
    statsD.distribution(
      "conversation_rendering.dropped_tokens",
      metrics.droppedTokens,
      [...baseTags, "layer:standard"]
    );
    statsD.distribution(
      "conversation_rendering.dropped_interactions",
      metrics.droppedInteractions,
      [...baseTags, "layer:standard"]
    );
  }
  if (metrics.floorDroppedTokens > 0) {
    statsD.distribution(
      "conversation_rendering.dropped_tokens",
      metrics.floorDroppedTokens,
      [...baseTags, "layer:floor"]
    );
    statsD.distribution(
      "conversation_rendering.dropped_interactions",
      metrics.floorDroppedInteractions,
      [...baseTags, "layer:floor"]
    );
  }
  if (metrics.dropSlackTokens !== null) {
    statsD.distribution(
      "conversation_rendering.drop_slack_tokens",
      metrics.dropSlackTokens,
      baseTags
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

// Renders that fail never reach the success emission above, so without this counter the metric
// family would be silent about its own worst cases (a conversation the escalation could not
// fit, or one with nothing to render). Pairs with the renders counter the way llm_error.count
// pairs with llm_success.count.
export function emitConversationRenderingError({
  kind,
  caller,
  providerId,
  modelId,
  windowStrategy,
}: {
  kind: "context_overflow" | "no_messages";
  caller: ConversationRenderingMetricsCaller;
  providerId: ModelProviderIdType;
  modelId: ModelIdType;
  windowStrategy: ConversationWindowStrategy;
}): void {
  getStatsDClient().increment("conversation_rendering.errors", 1, [
    `client_id:${providerId}`,
    `model_id:${modelId}`,
    `caller:${caller}`,
    `kind:${kind}`,
    `window_strategy:${windowStrategy}`,
  ]);
}
