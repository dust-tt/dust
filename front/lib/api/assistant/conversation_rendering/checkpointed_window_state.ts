import type {
  InteractionWithTokens,
  MessageWithTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import {
  getToolResultTokenSavings,
  IMAGE_CONTENT_TOKEN_COUNT,
  PRUNING_CHECKPOINT_TOKENS,
  pruneToolResultMessage,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import type {
  ConversationPruningStats,
  ConversationWindowResult,
} from "@app/lib/api/assistant/conversation_rendering/window_types";
import logger from "@app/logger/logger";
import type { Content } from "@app/types/assistant/generation";
import { isImageContent } from "@app/types/assistant/generation";
import type { Result } from "@app/types/shared/result";
import { Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";

const PRUNED_IMAGE_PLACEHOLDER =
  "<dust_system>" +
  "This image is no longer available (pruned to respect the model input image limit)." +
  "</dust_system>";
const PRUNED_IMAGE_PLACEHOLDER_TOKENS = 24;

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

type ImageBearingMessage = Extract<
  MessageWithTokens,
  { role: "user" | "content_fragment" | "function" }
>;

export const MINIMUM_PRUNING_BATCH_TOKENS = 5_000;

function pruneImagesBeyondLimit(
  message: MessageWithTokens,
  imagesToKeep: number
): {
  message: MessageWithTokens;
  prunedImageCount: number;
  retainedImageCount: number;
  tokenSavings: number;
} {
  let imageMessage: ImageBearingMessage;
  let content: Content[];

  switch (message.role) {
    case "user":
    case "content_fragment":
      imageMessage = message;
      content = message.content;
      break;

    case "function":
      if (!Array.isArray(message.content)) {
        return {
          message,
          prunedImageCount: 0,
          retainedImageCount: 0,
          tokenSavings: 0,
        };
      }
      imageMessage = message;
      content = message.content;
      break;

    case "assistant":
    case "compaction":
      return {
        message,
        prunedImageCount: 0,
        retainedImageCount: 0,
        tokenSavings: 0,
      };

    default:
      return assertNever(message);
  }

  let prunedImageCount = 0;
  let retainedImageCount = 0;
  const retainedContentReversed: Content[] = [];
  for (let index = content.length - 1; index >= 0; index--) {
    const item = content[index];
    if (!isImageContent(item) || retainedImageCount < imagesToKeep) {
      retainedContentReversed.push(item);
      if (isImageContent(item)) {
        retainedImageCount += 1;
      }
    } else {
      prunedImageCount += 1;
    }
  }

  if (prunedImageCount === 0) {
    return {
      message,
      prunedImageCount: 0,
      retainedImageCount,
      tokenSavings: 0,
    };
  }

  const retainedContent = retainedContentReversed.reverse();
  const addedPlaceholder = retainedContent.length === 0;
  const tokenSavings =
    prunedImageCount * IMAGE_CONTENT_TOKEN_COUNT -
    (addedPlaceholder ? PRUNED_IMAGE_PLACEHOLDER_TOKENS : 0);

  return {
    message: {
      ...imageMessage,
      content: addedPlaceholder
        ? [{ type: "text", text: PRUNED_IMAGE_PLACEHOLDER }]
        : retainedContent,
      tokenCount: imageMessage.tokenCount - tokenSavings,
    },
    prunedImageCount,
    retainedImageCount,
    tokenSavings,
  };
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
 *
 * When configured, an image limit is applied after tool-result pruning. The newest images are
 * retained and the oldest overflow is removed, including when token-based pruning did not run.
 */
export class CheckpointedConversationWindowState {
  private interactions: WindowInteraction[] = [];
  private retainedTokens = 0;
  private totalTokensBefore = 0;
  private prunedTokens = 0;
  private prunedImageCount = 0;
  private fitted = false;

  private pendingToolResults: PendingToolResult[] = [];
  private eligibleToolResults: EligibleToolResult[] = [];
  private nextEligibleToolResultIndex = 0;
  private eligibleToolResultTokenSavings = 0;

  private constructor(
    private readonly options: {
      pruningBudget: number;
      budgetForInteractions: number;
      logDetails: Record<string, unknown>;
      maxImages?: number;
    }
  ) {}

  static empty(options: {
    pruningBudget: number;
    budgetForInteractions: number;
    logDetails: Record<string, unknown>;
    maxImages?: number;
  }): CheckpointedConversationWindowState {
    return new CheckpointedConversationWindowState(options);
  }

  append(interaction: InteractionWithTokens): void {
    // fit() applies terminal rewrites, so cached pruning savings must not be reused afterward.
    if (this.fitted) {
      throw new Error("Cannot append to a fitted conversation window state.");
    }

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
    this.fitted = true;
    const { budgetForInteractions, logDetails } = this.options;

    if (this.interactions.length === 0) {
      return new Ok({
        interactions: [],
        prunedContext: false,
        stats: this.stats(),
      });
    }

    this.applyImageLimit();

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

  private applyImageLimit(): void {
    const { maxImages } = this.options;
    if (maxImages === undefined) {
      return;
    }

    let imagesToKeep = maxImages;
    for (
      let interactionIndex = this.interactions.length - 1;
      interactionIndex >= 0;
      interactionIndex--
    ) {
      const interaction = this.interactions[interactionIndex];
      for (
        let messageIndex = interaction.messages.length - 1;
        messageIndex >= 0;
        messageIndex--
      ) {
        const node = interaction.messages[messageIndex];
        const result = pruneImagesBeyondLimit(node.message, imagesToKeep);

        if (result.prunedImageCount > 0) {
          node.message = result.message;
          this.retainedTokens -= result.tokenSavings;
          this.prunedTokens += result.tokenSavings;
          this.prunedImageCount += result.prunedImageCount;
        }
        imagesToKeep -= result.retainedImageCount;
      }
    }
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
      prunedImageCount: this.prunedImageCount,
    };
  }
}
