import type {
  InteractionWithTokens,
  MessageWithTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import {
  getToolResultTokenSavings,
  PRUNING_CHECKPOINT_TOKENS,
  pruneToolResultMessage,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import type {
  ConversationPruningStats,
  ConversationWindowResult,
} from "@app/lib/api/assistant/conversation_rendering/window_types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";

type RegularMessageNode = {
  kind: "message";
  message: MessageWithTokens;
};

type ToolResultNode = {
  kind: "tool_result";
  message: Extract<MessageWithTokens, { role: "function" }>;
  tokenSavings: number;
};

type PendingToolResult = {
  phase: "pending";
  node: ToolResultNode;
};

type EligibleToolResult = {
  phase: "eligible";
  node: ToolResultNode;
};

// Interactions own these nodes. The pending and eligible queues only hold references to the same
// tool-result nodes, so a message payload is never duplicated.
type WindowMessageNode = RegularMessageNode | ToolResultNode;

type WindowInteraction = {
  messages: WindowMessageNode[];
};

function makeWindowMessageNode(message: MessageWithTokens): WindowMessageNode {
  if (message.role === "function") {
    return {
      kind: "tool_result",
      message,
      tokenSavings: getToolResultTokenSavings(message),
    };
  }

  return { kind: "message", message };
}

/**
 * Builds a model-facing conversation without ever removing an interaction.
 *
 * Tool results become eligible only after a later assistant message has consumed their complete
 * batch. Cleanup runs at model-input checkpoints and waits until a full token checkpoint can be
 * reclaimed. It then attempts to return one checkpoint below the soft limit. This keeps the
 * pruning frontier stable across the model calls within a long interaction and reduces how often
 * the provider cache frontier moves.
 *
 * If tool-result pruning cannot keep the complete interaction history below the nominal budget,
 * the window keeps serving it and reports the excess through logs and metrics. The provider limit
 * remains the final boundary. The latest unconsumed result batch always remains intact.
 */
export class CheckpointedConversationWindowState {
  private interactions: WindowInteraction[] = [];
  private retainedTokens = 0;
  private totalTokensBefore = 0;
  private prunedTokens = 0;

  private pendingToolResults: PendingToolResult[] = [];
  private eligibleToolResults: EligibleToolResult[] = [];
  private nextEligibleToolResultIndex = 0;
  private eligibleToolResultTokenSavings = 0;

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

      if (message.role === "assistant") {
        this.makePendingToolResultsEligible();
      }

      const node = makeWindowMessageNode(message);
      windowInteraction.messages.push(node);
      this.retainedTokens += message.tokenCount;
      this.totalTokensBefore += message.tokenCount;

      if (node.kind === "tool_result") {
        this.pendingToolResults.push({ phase: "pending", node });
      }

      if (this.isModelInputCheckpoint(message, nextMessage)) {
        this.applyBufferedPruning();
      }
    }
  }

  renderedInteractions(): InteractionWithTokens[] {
    return this.interactions.map((interaction) => ({
      messages: interaction.messages.map((node) => node.message),
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
          windowStage: "nominal_budget_exceeded_after_tool_result_pruning",
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

  private makePendingToolResultsEligible(): void {
    for (const { node } of this.pendingToolResults) {
      if (node.tokenSavings > 0) {
        this.eligibleToolResults.push({ phase: "eligible", node });
        this.eligibleToolResultTokenSavings += node.tokenSavings;
      }
    }

    this.pendingToolResults = [];
  }

  private applyBufferedPruning(): void {
    if (
      this.retainedTokens <= this.options.pruningBudget ||
      this.eligibleToolResultTokenSavings < PRUNING_CHECKPOINT_TOKENS
    ) {
      return;
    }

    const targetTokens = Math.max(
      this.options.pruningBudget - PRUNING_CHECKPOINT_TOKENS,
      0
    );

    while (
      this.retainedTokens > targetTokens &&
      this.nextEligibleToolResultIndex < this.eligibleToolResults.length
    ) {
      const { node } =
        this.eligibleToolResults[this.nextEligibleToolResultIndex];

      node.message = pruneToolResultMessage(node.message);
      this.retainedTokens -= node.tokenSavings;
      this.prunedTokens += node.tokenSavings;
      this.eligibleToolResultTokenSavings -= node.tokenSavings;
      this.nextEligibleToolResultIndex += 1;
    }
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
