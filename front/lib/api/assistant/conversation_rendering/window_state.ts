import type { InteractionWithTokens } from "@app/lib/api/assistant/conversation_rendering/pruning";
import {
  DROP_CHECKPOINT_TOKENS,
  dropInteractionsToFit,
  getInteractionTokenCount,
  getToolResultTokenSavings,
  PRUNING_CHECKPOINT_TOKENS,
  pruneToolResults,
  sumInteractionTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import type { ConversationWindowResult } from "@app/lib/api/assistant/conversation_rendering/window_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

// Existing consumers use this to decide when compaction is available. Keep that behavior
// independent from the window's soft-drop policy.
export const PREVIOUS_INTERACTIONS_TO_PRESERVE = 3;

const INTERACTIONS_TO_PRESERVE_AT_SOFT_LIMIT = 3;

/**
 * Deterministically replays an append-only sequence of interactions into a bounded model context.
 *
 * An instance is local to one render. Replaying additional interactions first reproduces every
 * decision for the previous interaction prefix, so tool results can only move from intact to
 * pruned and interactions can only move from retained to dropped at those boundaries.
 *
 * Above the soft limit, cleanup first prunes old tool results, then drops old interactions while
 * preserving the latest three. Each operation must reclaim a full checkpoint and targets one
 * checkpoint below the soft limit. At the hard limit those thresholds and interaction
 * protections are lifted. The current interaction is never dropped and its latest tool result is
 * never pruned. If that irreducible context cannot fit, the window returns an overflow.
 */
export class ConversationWindowState {
  private interactions: InteractionWithTokens[] = [];
  private retainedTokens = 0;
  private totalTokensBefore = 0;
  private interactionsBefore = 0;
  private prunedContext = false;
  private softPrunedTokens = 0;
  private softDroppedTokens = 0;
  private hardPrunedTokens = 0;
  private hardDroppedTokens = 0;
  private softDroppedInteractions = 0;
  private hardDroppedInteractions = 0;

  private constructor(
    private readonly options: {
      pruningBudget: number;
      budgetForInteractions: number;
      logDetails: Record<string, unknown>;
    }
  ) {}

  static empty(options: {
    pruningBudget: number;
    budgetForInteractions: number;
    logDetails: Record<string, unknown>;
  }): ConversationWindowState {
    return new ConversationWindowState(options);
  }

  append(interaction: InteractionWithTokens): void {
    const interactionTokens = getInteractionTokenCount(interaction);
    this.totalTokensBefore += interactionTokens;
    this.retainedTokens += interactionTokens;
    this.interactionsBefore += 1;
    this.interactions.push(interaction);

    this.pruneAtSoftLimit();
    this.dropAtSoftLimit();
    this.pruneAtHardLimit();
    this.dropAtHardLimit();
  }

  renderedInteractions(): InteractionWithTokens[] {
    return this.interactions;
  }

  fit(): Result<ConversationWindowResult, Error> {
    const { pruningBudget, budgetForInteractions, logDetails } = this.options;
    const totalTokens = this.totalTokens();

    // The caller reports the distinct no-messages error after windowing.
    if (this.interactionsBefore === 0) {
      return new Ok({
        interactions: [],
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

    const totalTokensAfterPruning =
      this.totalTokensBefore - this.softPrunedTokens;
    const totalTokensAfterDropping =
      totalTokensAfterPruning - this.softDroppedTokens;
    const totalTokensAfterFloorPruning =
      totalTokensAfterDropping - this.hardPrunedTokens;

    return new Ok({
      interactions: this.interactions,
      prunedContext: this.prunedContext,
      stats: {
        totalTokensBefore: this.totalTokensBefore,
        totalTokensAfterPruning,
        totalTokensAfterDropping,
        totalTokensAfterFloorPruning,
        totalTokensAfterFloorDropping:
          totalTokensAfterFloorPruning - this.hardDroppedTokens,
        interactionsBefore: this.interactionsBefore,
        interactionsAfterDropping:
          this.interactionsBefore - this.softDroppedInteractions,
        interactionsAfterFloorDropping:
          this.interactionsBefore -
          this.softDroppedInteractions -
          this.hardDroppedInteractions,
        pruningBudget,
        budgetForInteractions,
      },
    });
  }

  private pruneAtSoftLimit(): void {
    if (!this.exceedsSoftLimit()) {
      return;
    }

    const eligibleToolResultCount = this.prunableToolResultCount();
    if (
      this.toolResultTokenSavings(eligibleToolResultCount) <
      PRUNING_CHECKPOINT_TOKENS
    ) {
      return;
    }

    this.pruneEligibleToolResults({
      eligibleToolResultCount,
      maxTokens: this.softCleanupTarget(),
      tier: "soft",
    });
  }

  private dropAtSoftLimit(): void {
    if (!this.exceedsSoftLimit()) {
      return;
    }

    const droppableInteractionCount = Math.max(
      this.interactions.length - INTERACTIONS_TO_PRESERVE_AT_SOFT_LIMIT,
      0
    );
    const droppableTokens = sumInteractionTokens(
      this.interactions.slice(0, droppableInteractionCount)
    );
    if (droppableTokens < DROP_CHECKPOINT_TOKENS) {
      return;
    }

    const before = this.interactions;
    const after = dropInteractionsToFit(before, {
      maxTokens: this.softCleanupTarget(),
      interactionsToPreserve: INTERACTIONS_TO_PRESERVE_AT_SOFT_LIMIT,
      batchToCheckpoint: true,
    });
    if (after === before) {
      return;
    }

    const tokensAfter = sumInteractionTokens(after);
    this.softDroppedTokens += this.retainedTokens - tokensAfter;
    this.softDroppedInteractions += before.length - after.length;
    this.prunedContext = true;
    this.interactions = after;
    this.retainedTokens = tokensAfter;
  }

  private pruneAtHardLimit(): void {
    if (!this.exceedsHardBudget()) {
      return;
    }

    this.pruneEligibleToolResults({
      eligibleToolResultCount: this.prunableToolResultCount(),
      maxTokens: this.softCleanupTarget(),
      tier: "hard",
    });
  }

  private dropAtHardLimit(): void {
    if (!this.exceedsHardBudget()) {
      return;
    }

    const currentInteraction = this.interactions[this.interactions.length - 1];
    const previousBefore = this.interactions.slice(0, -1);
    const previousAfter = dropInteractionsToFit(previousBefore, {
      maxTokens:
        this.softCleanupTarget() - getInteractionTokenCount(currentInteraction),
      interactionsToPreserve: 0,
      batchToCheckpoint: false,
    });
    if (previousAfter === previousBefore) {
      return;
    }

    logger.warn(
      {
        ...this.options.logDetails,
        totalTokens: sumInteractionTokens(this.interactions),
        budgetForInteractions: this.options.budgetForInteractions,
      },
      "Soft cleanup was insufficient; dropping previous interactions at the hard limit."
    );
    const tokensAfter =
      sumInteractionTokens(previousAfter) +
      getInteractionTokenCount(currentInteraction);
    this.hardDroppedTokens += this.retainedTokens - tokensAfter;
    this.hardDroppedInteractions +=
      previousBefore.length - previousAfter.length;
    this.prunedContext = true;
    this.interactions = [...previousAfter, currentInteraction];
    this.retainedTokens = tokensAfter;
  }

  private pruneEligibleToolResults({
    eligibleToolResultCount,
    maxTokens,
    tier,
  }: {
    eligibleToolResultCount: number;
    maxTokens: number;
    tier: "soft" | "hard";
  }): void {
    if (eligibleToolResultCount === 0) {
      return;
    }

    const before = this.interactions;
    const after = pruneToolResults(before, {
      batchToCheckpoint: true,
      maxTokens,
      eligibleToolResultCount,
    });
    if (after === before) {
      return;
    }

    const tokensAfter = sumInteractionTokens(after);
    const prunedTokens = this.retainedTokens - tokensAfter;
    switch (tier) {
      case "soft":
        this.softPrunedTokens += prunedTokens;
        break;
      case "hard":
        logger.warn(
          {
            ...this.options.logDetails,
            totalTokens: sumInteractionTokens(before),
            budgetForInteractions: this.options.budgetForInteractions,
          },
          "Soft cleanup was insufficient; pruning tool results at the hard limit."
        );
        this.hardPrunedTokens += prunedTokens;
        break;
      default:
        assertNever(tier);
    }
    this.prunedContext = true;
    this.interactions = after;
    this.retainedTokens = tokensAfter;
  }

  private prunableToolResultCount(): number {
    const currentInteraction = this.interactions[this.interactions.length - 1];
    const currentHasToolResult = currentInteraction.messages.some(
      (message) => message.role === "function"
    );

    return (
      this.countToolResults(this.interactions) - (currentHasToolResult ? 1 : 0)
    );
  }

  /**
   * This scan is O(retained messages). Since stateless replay calls it once per appended
   * interaction above the soft limit, the pathological replay cost can approach O(n²).
   *
   * Checkpoint cleanup normally leaves the latest three interactions plus fewer than 20k tokens
   * of droppable history. The expected scan is therefore hundreds to low thousands of messages
   * and low single-digit milliseconds. Histories made of unusually tiny messages remain bounded
   * by the hard context limit. This tradeoff avoids persisted state in this version. A stateful
   * window can maintain the savings incrementally and remove the repeated scan.
   */
  private toolResultTokenSavings(eligibleToolResultCount: number): number {
    let remaining = eligibleToolResultCount;
    let savings = 0;

    for (const interaction of this.interactions) {
      for (const message of interaction.messages) {
        if (message.role === "function" && remaining > 0) {
          savings += getToolResultTokenSavings(message);
          remaining -= 1;
        }
      }
    }

    return savings;
  }

  private countToolResults(interactions: InteractionWithTokens[]): number {
    return interactions.reduce(
      (count, interaction) =>
        count +
        interaction.messages.filter((message) => message.role === "function")
          .length,
      0
    );
  }

  private exceedsHardBudget(): boolean {
    return this.totalTokens() > this.options.budgetForInteractions;
  }

  private exceedsSoftLimit(): boolean {
    return this.totalTokens() > this.options.pruningBudget;
  }

  private softCleanupTarget(): number {
    const headroomTokens = Math.max(
      PRUNING_CHECKPOINT_TOKENS,
      DROP_CHECKPOINT_TOKENS
    );

    return this.options.pruningBudget > headroomTokens
      ? this.options.pruningBudget - headroomTokens
      : this.options.pruningBudget;
  }

  private totalTokens(): number {
    return this.retainedTokens;
  }
}
