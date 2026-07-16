import type { ConversationPruningStats } from "@app/lib/api/assistant/conversation_rendering/instrumentation";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { InteractionWithTokens } from "./pruning";
import {
  dropInteractionsToFit,
  getInteractionTokenCount,
  pruneToolResults,
  sumInteractionTokens,
  TOOL_RESULTS_TO_PRESERVE,
} from "./pruning";

// How many of the most recent interactions dropInteractionsToFit never drops entirely, even if
// their own tool results were already pruned. A different floor from TOOL_RESULTS_TO_PRESERVE
// (pruning.ts). That one protects tool result content regardless of turn. This one protects whole
// recent turns from being erased regardless of how many tool calls they made.
export const PREVIOUS_INTERACTIONS_TO_PRESERVE = 3;

type ConversationWindowResult = {
  interactions: InteractionWithTokens[];
  prunedContext: boolean;
  stats: ConversationPruningStats;
};

/**
 * Applies the conversation-window fitting policy to one complete interaction snapshot.
 *
 * This class intentionally preserves the existing one-shot behavior. It does not retain state
 * across renders or apply interactions incrementally.
 */
export class ConversationWindowState {
  private constructor(
    private readonly interactions: InteractionWithTokens[],
    private readonly options: {
      pruningBudget: number;
      budgetForInteractions: number;
      logDetails: Record<string, unknown>;
    }
  ) {}

  static fromSnapshot(
    interactions: InteractionWithTokens[],
    options: {
      pruningBudget: number;
      budgetForInteractions: number;
      logDetails: Record<string, unknown>;
    }
  ): ConversationWindowState {
    return new ConversationWindowState(interactions, options);
  }

  /**
   * Escalates through the existing four cleanup layers until the snapshot fits.
   */
  fit(): Result<ConversationWindowResult, Error> {
    const { pruningBudget, budgetForInteractions, logDetails } = this.options;

    // An empty conversation trivially fits, and the layers below assume at least one interaction.
    if (this.interactions.length === 0) {
      return new Ok({
        interactions: this.interactions,
        prunedContext: false,
        stats: {
          totalTokensBefore: 0,
          totalTokensAfterPruning: 0,
          totalTokensAfterDropping: 0,
          totalTokensAfterFloorPruning: 0,
          totalTokensAfterFloorDropping: 0,
          interactionsBefore: 0,
          interactionsAfterDropping: 0,
          interactionsAfterFloorDropping: 0,
          pruningBudget,
          budgetForInteractions,
        },
      });
    }

    const totalTokensBefore = sumInteractionTokens(this.interactions);

    // Layer 1: proactive pruning, within the protected floor, up to pruningBudget.
    let pruned = pruneToolResults(this.interactions, {
      maxTokens: pruningBudget,
      toolResultsToPreserve: TOOL_RESULTS_TO_PRESERVE,
    });
    let prunedContext = pruned !== this.interactions;
    let totalTokens = sumInteractionTokens(pruned);
    const totalTokensAfterPruning = totalTokens;

    // Layer 2: drop whole previous interactions, oldest first. The last
    // PREVIOUS_INTERACTIONS_TO_PRESERVE of them are protected, and the current one always survives.
    if (totalTokens > budgetForInteractions) {
      const currentInteraction = pruned[pruned.length - 1];
      const previousBefore = pruned.slice(0, -1);
      const previousAfter = dropInteractionsToFit(previousBefore, {
        maxTokens:
          budgetForInteractions - getInteractionTokenCount(currentInteraction),
        interactionsToPreserve: PREVIOUS_INTERACTIONS_TO_PRESERVE,
        batchToCheckpoint: true,
      });
      if (previousAfter !== previousBefore) {
        prunedContext = true;
        pruned = [...previousAfter, currentInteraction];
        totalTokens = sumInteractionTokens(pruned);
      }
    }
    const totalTokensAfterDropping = totalTokens;
    const interactionsAfterDropping = pruned.length;

    // Layer 3: reaching here means layer 2 dropped every previous interaction it was allowed to,
    // and what remains (the last PREVIOUS_INTERACTIONS_TO_PRESERVE plus the current interaction)
    // still doesn't fit. Force pruning past TOOL_RESULTS_TO_PRESERVE into the protected floor.
    if (totalTokens > budgetForInteractions) {
      logger.warn(
        { ...logDetails, totalTokens, budgetForInteractions },
        "Dropped every eligible previous interaction; still over budget, forcing floor pruning."
      );
      const beforeFloorPruning = pruned;
      pruned = pruneToolResults(pruned, {
        maxTokens: budgetForInteractions,
        toolResultsToPreserve: 0,
      });
      if (pruned !== beforeFloorPruning) {
        prunedContext = true;
      }
      totalTokens = sumInteractionTokens(pruned);
    }
    const totalTokensAfterFloorPruning = totalTokens;

    // Layer 4: still over budget with every tool result already at placeholder size. Drop previous
    // interactions past PREVIOUS_INTERACTIONS_TO_PRESERVE, down to the current interaction alone
    // if needed. Minimal drops here, not batched: the head moves on this call regardless, and the
    // interactions a batched over-drop would additionally erase are the most recent ones.
    if (totalTokens > budgetForInteractions) {
      logger.warn(
        { ...logDetails, totalTokens, budgetForInteractions },
        "Floor pruning still not enough; dropping previous interactions past the normal floor."
      );
      const currentInteraction = pruned[pruned.length - 1];
      const previousBefore = pruned.slice(0, -1);
      const previousAfter = dropInteractionsToFit(previousBefore, {
        maxTokens:
          budgetForInteractions - getInteractionTokenCount(currentInteraction),
        interactionsToPreserve: 0,
        batchToCheckpoint: false,
      });
      if (previousAfter !== previousBefore) {
        prunedContext = true;
        pruned = [...previousAfter, currentInteraction];
        totalTokens = sumInteractionTokens(pruned);
      }
    }

    // Last resort exhausted: even the current interaction alone doesn't fit.
    if (totalTokens > budgetForInteractions) {
      logger.error(
        {
          ...logDetails,
          failureStage: "interaction_exceeds_after_pruning",
          totalTokens,
          budgetForInteractions,
        },
        "Render Conversation V2: No interactions fit in context window."
      );
      return new Err(
        new Error("Context window exceeded: at least one message is required")
      );
    }

    return new Ok({
      interactions: pruned,
      prunedContext,
      stats: {
        totalTokensBefore,
        totalTokensAfterPruning,
        totalTokensAfterDropping,
        totalTokensAfterFloorPruning,
        totalTokensAfterFloorDropping: totalTokens,
        interactionsBefore: this.interactions.length,
        interactionsAfterDropping,
        interactionsAfterFloorDropping: pruned.length,
        pruningBudget,
        budgetForInteractions,
      },
    });
  }
}
