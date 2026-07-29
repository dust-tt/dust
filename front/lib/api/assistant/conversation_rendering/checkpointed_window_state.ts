import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import {
  FILES_CAT_ACTION_NAME,
  FILES_SERVER_NAME,
} from "@app/lib/api/actions/servers/files/metadata";
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
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { isImageContent } from "@app/types/assistant/generation";
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
  pruned: boolean;
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

export const MINIMUM_PRUNING_BATCH_TOKENS = 5_000;

export type ConversationImagePruningStats = {
  imageCountLimit?: number;
  prunedImageCount: number;
  nonToolImageCount: number;
};

type ConversationImagePruningOptions = {
  maxInputImages?: number;
  logDetails: Record<string, unknown>;
};

type ConversationImagePruningResult = {
  messages: ModelMessageTypeMultiActions[];
  stats: ConversationImagePruningStats;
};

const FILES_CAT_TOOL_NAME = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_CAT_ACTION_NAME
);

function pruneOldestToolResultImages(
  messages: ModelMessageTypeMultiActions[],
  { maxInputImages, logDetails }: ConversationImagePruningOptions
): ConversationImagePruningResult {
  if (maxInputImages === undefined) {
    return {
      messages,
      stats: { prunedImageCount: 0, nonToolImageCount: 0 },
    };
  }

  const imageCounts = messages.reduce(
    (counts, message) => {
      const count =
        "content" in message && Array.isArray(message.content)
          ? message.content.filter(isImageContent).length
          : 0;

      return {
        total: counts.total + count,
        nonTool: counts.nonTool + (message.role === "function" ? 0 : count),
      };
    },
    { total: 0, nonTool: 0 }
  );
  const stats = {
    imageCountLimit: maxInputImages,
    prunedImageCount: 0,
    nonToolImageCount: imageCounts.nonTool,
  };

  if (imageCounts.nonTool >= maxInputImages) {
    logger.warn(
      {
        ...logDetails,
        imageCountLimit: maxInputImages,
        nonToolImageCount: imageCounts.nonTool,
        totalImageCount: imageCounts.total,
      },
      "Conversation contains images that cannot be pruned to the model input limit."
    );
  }

  let imagesToPrune = imageCounts.total - maxInputImages;
  if (imagesToPrune <= 0) {
    return { messages, stats };
  }

  const prunedMessages = messages.map((message) =>
    message.role === "function" && Array.isArray(message.content)
      ? {
          ...message,
          content: message.content.flatMap((content) => {
            if (isImageContent(content) && imagesToPrune > 0) {
              imagesToPrune -= 1;
              stats.prunedImageCount += 1;
              return [
                {
                  type: "text" as const,
                  text:
                    `[This image preview is no longer displayed because the conversation exceeds the ${maxInputImages}-image limit.` +
                    (content.file_path
                      ? ` Use \`${FILES_CAT_TOOL_NAME}\` with path \`${content.file_path}\` to display it again.]`
                      : " Re-run the tool to display it again.]"),
                },
              ];
            }

            return [content];
          }),
        }
      : message
  );

  return { messages: prunedMessages, stats };
}

function makeWindowMessageNode(message: MessageWithTokens): WindowMessageNode {
  if (message.role === "function") {
    return {
      kind: "tool_result",
      message,
      tokenSavings: getToolResultTokenSavings(message),
      pruned: false,
    };
  }

  return { kind: "message", message };
}

/**
 * Builds a model-facing conversation without ever removing an interaction.
 *
 * Tool results become eligible only after a later assistant message has consumed their complete
 * batch. Cleanup runs at model-input checkpoints and normally waits until the preferred 20k token
 * checkpoint can be reclaimed. If the nominal hard budget is crossed, it may accept a smaller
 * batch of at least 5k when pruning that complete batch restores fit. This keeps the pruning
 * frontier stable during normal growth without ignoring a meaningful final batch under pressure.
 * Preferred batches attempt to return one checkpoint below the soft limit.
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

  static pruneOldestToolResultImages(
    messages: ModelMessageTypeMultiActions[],
    options: ConversationImagePruningOptions
  ): ConversationImagePruningResult {
    return pruneOldestToolResultImages(messages, options);
  }

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
      prunedContext: this.latestInteractionHasPrunedToolResults(),
      stats: this.stats(),
    });
  }

  private latestInteractionHasPrunedToolResults(): boolean {
    const latestInteraction = this.interactions[this.interactions.length - 1];

    return latestInteraction.messages.some(
      (node) => node.kind === "tool_result" && node.pruned
    );
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
    if (this.retainedTokens <= this.options.pruningBudget) {
      return;
    }

    const hasPreferredBatch =
      this.eligibleToolResultTokenSavings >= PRUNING_CHECKPOINT_TOKENS;
    const canRestoreNominalBudgetWithSmallerBatch =
      this.retainedTokens > this.options.budgetForInteractions &&
      this.eligibleToolResultTokenSavings >= MINIMUM_PRUNING_BATCH_TOKENS &&
      this.retainedTokens - this.eligibleToolResultTokenSavings <=
        this.options.budgetForInteractions;

    if (!hasPreferredBatch && !canRestoreNominalBudgetWithSmallerBatch) {
      return;
    }

    const targetTokens = hasPreferredBatch
      ? Math.max(this.options.pruningBudget - PRUNING_CHECKPOINT_TOKENS, 0)
      : this.retainedTokens - this.eligibleToolResultTokenSavings;

    while (
      this.retainedTokens > targetTokens &&
      this.nextEligibleToolResultIndex < this.eligibleToolResults.length
    ) {
      const { node } =
        this.eligibleToolResults[this.nextEligibleToolResultIndex];

      node.message = pruneToolResultMessage(node.message);
      node.pruned = true;
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
      pruningBudget: this.options.pruningBudget,
      budgetForInteractions: this.options.budgetForInteractions,
    };
  }
}
