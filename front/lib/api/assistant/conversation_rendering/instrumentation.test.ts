import type { ConversationPruningStats } from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import { computeConversationRenderingMetrics } from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import { describe, expect, it } from "vitest";

// A render where nothing happened: every snapshot equals the starting total.
function statsWhereNothingHappened(): ConversationPruningStats {
  return {
    totalTokensBefore: 50_000,
    totalTokensAfterPruning: 50_000,
    pruningBudget: 100_000,
    budgetForInteractions: 160_000,
    prunedImageCount: 0,
  };
}

describe("computeConversationRenderingMetrics", () => {
  it("reports a clean fit when no layer changed anything", () => {
    const metrics = computeConversationRenderingMetrics(
      statsWhereNothingHappened()
    );

    expect(metrics.outcome).toBe("fits");
    expect(metrics.saturated).toBe(false);
    expect(metrics.overBudget).toBe(false);
    expect(metrics.tokensOverBudget).toBe(0);
    expect(metrics.prunedTokens).toBe(0);
  });

  it("attributes reclaimed tokens to the layer whose snapshot moved", () => {
    const metrics = computeConversationRenderingMetrics({
      ...statsWhereNothingHappened(),
      totalTokensBefore: 150_000,
      totalTokensAfterPruning: 90_000,
    });

    expect(metrics.outcome).toBe("pruned");
    expect(metrics.prunedTokens).toBe(60_000);
    expect(metrics.saturated).toBe(false);
  });

  it("flags saturation when pruning ran out of eligible results while still over its budget", () => {
    // Pruning reclaimed what it could (150k to 110k) but 110k still exceeds the 100k pruning
    // budget: the preserved window is now the only unpruned tool content, and it slides on every
    // new tool step. This is the regime the dashboard exists to size.
    const metrics = computeConversationRenderingMetrics({
      ...statsWhereNothingHappened(),
      totalTokensBefore: 150_000,
      totalTokensAfterPruning: 110_000,
    });

    expect(metrics.outcome).toBe("pruned");
    expect(metrics.saturated).toBe(true);
  });

  it("measures context served beyond the nominal interaction budget", () => {
    const metrics = computeConversationRenderingMetrics({
      ...statsWhereNothingHappened(),
      totalTokensBefore: 175_000,
      totalTokensAfterPruning: 175_000,
    });

    expect(metrics.overBudget).toBe(true);
    expect(metrics.tokensOverBudget).toBe(15_000);
  });
});
