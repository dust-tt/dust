import type {
  AssistantMessageWithTokens,
  InteractionWithTokens,
  MessageWithTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import {
  getReasoningTokenSavings,
  getToolResultTokenSavings,
  PRUNING_CHECKPOINT_TOKENS,
  pruneReasoningMessage,
  pruneToolResultMessage,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import type {
  ConversationPruningStats,
  ConversationWindowResult,
} from "@app/lib/api/assistant/conversation_rendering/window_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

type RegularMessageNode = {
  kind: "message";
  message: MessageWithTokens;
};

type PruningEligibility = "next_assistant" | "next_real_user";
type PruningState = "pending" | "eligible" | "pruned";

type ToolResultNode = {
  kind: "tool_result";
  eligibility: "next_assistant";
  message: Extract<MessageWithTokens, { role: "function" }>;
  pruningState: PruningState;
  tokenSavings: number;
};

type ReasoningMessageNode = {
  kind: "reasoning_message";
  eligibility: "next_real_user";
  message: AssistantMessageWithTokens;
  omitted: boolean;
  pruningState: PruningState;
  tokenSavings: number;
};

type PrunableMessageNode = ToolResultNode | ReasoningMessageNode;
type PrunableMessageKind = PrunableMessageNode["kind"];
type WindowMessageNode = RegularMessageNode | PrunableMessageNode;

type WindowInteraction = {
  messages: WindowMessageNode[];
};

export const MINIMUM_PRUNING_BATCH_TOKENS = 5_000;

const PRUNING_ORDER: PrunableMessageKind[] = [
  "tool_result",
  "reasoning_message",
];

function makeWindowMessageNode(message: MessageWithTokens): WindowMessageNode {
  if (message.role === "function") {
    const tokenSavings = getToolResultTokenSavings(message);
    if (tokenSavings === 0) {
      return { kind: "message", message };
    }

    return {
      kind: "tool_result",
      eligibility: "next_assistant",
      message,
      pruningState: "pending",
      tokenSavings,
    };
  }

  if (message.role === "assistant") {
    const tokenSavings = getReasoningTokenSavings(message);
    if (tokenSavings > 0) {
      return {
        kind: "reasoning_message",
        eligibility: "next_real_user",
        message,
        omitted: false,
        pruningState: "pending",
        tokenSavings,
      };
    }
  }

  return { kind: "message", message };
}

/**
 * Builds a model-facing conversation without ever removing an interaction.
 *
 * Tool results become eligible after a later assistant message has consumed their complete batch.
 * Reasoning becomes eligible only when a later real user message starts, preserving every
 * reasoning block in the active tool-use turn. Cleanup considers their combined savings, prunes
 * tool results before reasoning, and normally waits until the preferred 20k token checkpoint can
 * be reclaimed. If the nominal hard budget is crossed, it may accept a smaller batch of at least
 * 5k when pruning that complete batch restores fit. Preferred batches attempt to return one
 * checkpoint below the soft limit.
 *
 * If checkpointed pruning cannot keep the complete interaction history below the nominal budget,
 * the window keeps serving it and reports the excess through logs and metrics. The provider limit
 * remains the final boundary. The latest unconsumed result batch and active-turn reasoning always
 * remain intact.
 */
export class CheckpointedConversationWindowState {
  private interactions: WindowInteraction[] = [];
  private retainedTokens = 0;
  private totalTokensBefore = 0;
  private prunedTokens = 0;

  // Interactions and this registry reference the same nodes, so message payloads are not copied.
  private prunableNodes: PrunableMessageNode[] = [];
  private eligibleTokenSavings = 0;
  private nextEligibilityIndex: Record<PruningEligibility, number> = {
    next_assistant: 0,
    next_real_user: 0,
  };
  private nextPruningIndex: Record<PrunableMessageKind, number> = {
    tool_result: 0,
    reasoning_message: 0,
  };

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
  }): CheckpointedConversationWindowState {
    return new CheckpointedConversationWindowState(options);
  }

  append(interaction: InteractionWithTokens): void {
    if (interaction.messages.length === 0) {
      return;
    }

    const windowInteraction: WindowInteraction = { messages: [] };
    this.interactions.push(windowInteraction);

    for (
      let messageIndex = 0;
      messageIndex < interaction.messages.length;
      messageIndex++
    ) {
      const message = interaction.messages[messageIndex];
      const nextMessage = interaction.messages[messageIndex + 1];

      if (message.role === "user" && message.name !== "system") {
        this.makePendingNodesEligible("next_real_user");
      }

      if (message.role === "assistant") {
        this.makePendingNodesEligible("next_assistant");
      }

      const node = makeWindowMessageNode(message);
      windowInteraction.messages.push(node);
      this.retainedTokens += message.tokenCount;
      this.totalTokensBefore += message.tokenCount;

      if (node.kind !== "message") {
        this.prunableNodes.push(node);
      }

      if (this.isModelInputCheckpoint(message, nextMessage)) {
        this.applyBufferedPruning();
      }
    }
  }

  renderedInteractions(): InteractionWithTokens[] {
    return this.interactions.map((interaction) => ({
      messages: interaction.messages.flatMap((node) =>
        node.kind === "reasoning_message" && node.omitted ? [] : [node.message]
      ),
    }));
  }

  fit(): Result<ConversationWindowResult, Error> {
    const { budgetForInteractions, logDetails } = this.options;

    if (this.interactions.length === 0) {
      return new Ok({
        interactions: [],
        prunedContext: false,
        stats: this.stats(),
      });
    }

    if (this.retainedTokens > budgetForInteractions) {
      logger.warn(
        {
          ...logDetails,
          windowStage: "nominal_budget_exceeded_after_checkpointed_pruning",
          totalTokens: this.retainedTokens,
          budgetForInteractions,
          tokensOverBudget: this.retainedTokens - budgetForInteractions,
        },
        "Render Conversation V2: complete interaction history exceeds the nominal budget."
      );
    }

    // Crossing the nominal budget remains non-fatal. At 80% utilization the UI requires
    // compaction before the next user turn, while an active agent run continues to the provider
    // limit.
    return new Ok({
      interactions: this.renderedInteractions(),
      prunedContext: this.prunedTokens > 0,
      stats: this.stats(),
    });
  }

  private isModelInputCheckpoint(
    message: MessageWithTokens,
    nextMessage: MessageWithTokens | undefined
  ): boolean {
    const endsUserInput =
      message.role === "user" &&
      nextMessage?.role !== "user" &&
      nextMessage?.role !== "content_fragment";
    const endsToolResultBatch =
      message.role === "function" && nextMessage?.role !== "function";

    return endsUserInput || endsToolResultBatch;
  }

  private makePendingNodesEligible(eligibility: PruningEligibility): void {
    const startIndex = this.nextEligibilityIndex[eligibility];

    for (
      let nodeIndex = startIndex;
      nodeIndex < this.prunableNodes.length;
      nodeIndex++
    ) {
      const node = this.prunableNodes[nodeIndex];
      if (node.eligibility === eligibility && node.pruningState === "pending") {
        node.pruningState = "eligible";
        this.eligibleTokenSavings += node.tokenSavings;
      }
    }

    this.nextEligibilityIndex[eligibility] = this.prunableNodes.length;
  }

  private applyBufferedPruning(): void {
    if (this.retainedTokens <= this.options.pruningBudget) {
      return;
    }

    const hasPreferredBatch =
      this.eligibleTokenSavings >= PRUNING_CHECKPOINT_TOKENS;
    const canRestoreNominalBudgetWithSmallerBatch =
      this.retainedTokens > this.options.budgetForInteractions &&
      this.eligibleTokenSavings >= MINIMUM_PRUNING_BATCH_TOKENS &&
      this.retainedTokens - this.eligibleTokenSavings <=
        this.options.budgetForInteractions;

    if (!hasPreferredBatch && !canRestoreNominalBudgetWithSmallerBatch) {
      return;
    }

    const targetTokens = hasPreferredBatch
      ? Math.max(this.options.pruningBudget - PRUNING_CHECKPOINT_TOKENS, 0)
      : this.retainedTokens - this.eligibleTokenSavings;

    for (const kind of PRUNING_ORDER) {
      this.pruneEligibleNodes(kind, targetTokens);
    }
  }

  private pruneEligibleNodes(
    kind: PrunableMessageKind,
    targetTokens: number
  ): void {
    let nodeIndex = this.nextPruningIndex[kind];
    while (
      this.retainedTokens > targetTokens &&
      nodeIndex < this.prunableNodes.length
    ) {
      const node = this.prunableNodes[nodeIndex];
      if (node.kind !== kind) {
        nodeIndex += 1;
        continue;
      }

      // Eligibility is monotonic within a kind, so no later node of this kind can be eligible yet.
      if (node.pruningState === "pending") {
        break;
      }

      if (node.pruningState === "eligible") {
        this.pruneNode(node);
      }

      nodeIndex += 1;
    }

    this.nextPruningIndex[kind] = nodeIndex;
  }

  private pruneNode(node: PrunableMessageNode): void {
    switch (node.kind) {
      case "tool_result":
        node.message = pruneToolResultMessage(node.message);
        break;
      case "reasoning_message": {
        const prunedMessage = pruneReasoningMessage(node.message);
        if (prunedMessage) {
          node.message = prunedMessage;
        } else {
          node.omitted = true;
        }
        break;
      }
      default:
        assertNever(node);
    }

    node.pruningState = "pruned";
    this.eligibleTokenSavings -= node.tokenSavings;
    this.retainedTokens -= node.tokenSavings;
    this.prunedTokens += node.tokenSavings;
  }

  private stats(): ConversationPruningStats {
    const totalTokensAfterPruning = this.totalTokensBefore - this.prunedTokens;

    return {
      totalTokensBefore: this.totalTokensBefore,
      totalTokensAfterPruning,
      totalTokensAfterDropping: totalTokensAfterPruning,
      totalTokensAfterFloorPruning: totalTokensAfterPruning,
      totalTokensAfterFloorDropping: totalTokensAfterPruning,
      interactionsBefore: this.interactions.length,
      interactionsAfterDropping: this.interactions.length,
      interactionsAfterFloorDropping: this.interactions.length,
      pruningBudget: this.options.pruningBudget,
      budgetForInteractions: this.options.budgetForInteractions,
    };
  }
}
