import type { ConversationPruningStats } from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import { computeConversationRenderingMetrics } from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import { describe, expect, it } from "vitest";

// A render where nothing happened: every snapshot equals the starting total.
function statsWhereNothingHappened(): ConversationPruningStats {
  return {
    totalTokensBefore: 50_000,
    totalTokensAfterPruning: 50_000,
    totalTokensAfterDropping: 50_000,
    totalTokensAfterFloorPruning: 50_000,
    totalTokensAfterFloorDropping: 50_000,
    interactionsBefore: 12,
    interactionsAfterDropping: 12,
    interactionsAfterFloorDropping: 12,
    pruningBudget: 100_000,
    budgetForInteractions: 160_000,
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
    expect(metrics.droppedTokens).toBe(0);
    expect(metrics.dropSlackTokens).toBeNull();
  });

  it("attributes reclaimed tokens to the layer whose snapshot moved", () => {
    const metrics = computeConversationRenderingMetrics({
      ...statsWhereNothingHappened(),
      totalTokensBefore: 150_000,
      totalTokensAfterPruning: 90_000,
      totalTokensAfterDropping: 90_000,
      totalTokensAfterFloorPruning: 90_000,
      totalTokensAfterFloorDropping: 90_000,
    });

    expect(metrics.outcome).toBe("pruned");
    expect(metrics.prunedTokens).toBe(60_000);
    expect(metrics.droppedTokens).toBe(0);
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
      totalTokensAfterDropping: 110_000,
      totalTokensAfterFloorPruning: 110_000,
      totalTokensAfterFloorDropping: 110_000,
    });

    expect(metrics.outcome).toBe("pruned");
    expect(metrics.saturated).toBe(true);
  });

  it("measures context served beyond the nominal interaction budget", () => {
    const metrics = computeConversationRenderingMetrics({
      ...statsWhereNothingHappened(),
      totalTokensBefore: 175_000,
      totalTokensAfterPruning: 175_000,
      totalTokensAfterDropping: 175_000,
      totalTokensAfterFloorPruning: 175_000,
      totalTokensAfterFloorDropping: 175_000,
    });

    expect(metrics.overBudget).toBe(true);
    expect(metrics.tokensOverBudget).toBe(15_000);
  });

  it("measures drop slack, the headroom that predicts when the next full cache miss comes", () => {
    // The batched drop landed at 140k against a 160k hard budget: 20k of slack, so roughly a
    // checkpoint's worth of turns fit before the head must move again.
    const metrics = computeConversationRenderingMetrics({
      ...statsWhereNothingHappened(),
      totalTokensBefore: 200_000,
      totalTokensAfterPruning: 180_000,
      totalTokensAfterDropping: 140_000,
      totalTokensAfterFloorPruning: 140_000,
      totalTokensAfterFloorDropping: 140_000,
      interactionsBefore: 40,
      interactionsAfterDropping: 30,
      interactionsAfterFloorDropping: 30,
    });

    expect(metrics.outcome).toBe("dropped");
    expect(metrics.droppedTokens).toBe(40_000);
    expect(metrics.droppedInteractions).toBe(10);
    expect(metrics.dropSlackTokens).toBe(20_000);
    expect(metrics.saturated).toBe(true);
  });

  it("reports the deepest acting layer as the outcome when the escalation runs all the way down", () => {
    const metrics = computeConversationRenderingMetrics({
      ...statsWhereNothingHappened(),
      totalTokensBefore: 300_000,
      totalTokensAfterPruning: 250_000,
      totalTokensAfterDropping: 200_000,
      totalTokensAfterFloorPruning: 170_000,
      totalTokensAfterFloorDropping: 150_000,
      interactionsBefore: 50,
      interactionsAfterDropping: 20,
      interactionsAfterFloorDropping: 5,
    });

    expect(metrics.outcome).toBe("floor_dropped");
    expect(metrics.prunedTokens).toBe(50_000);
    expect(metrics.droppedTokens).toBe(50_000);
    expect(metrics.floorPrunedTokens).toBe(30_000);
    expect(metrics.floorDroppedTokens).toBe(20_000);
    expect(metrics.floorDroppedInteractions).toBe(15);
  });
});
