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
import type { ImageContent } from "@app/types/assistant/generation";
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
  eligible: boolean;
  imageReferences: ToolImageReference[];
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
// Fixed number of tokens assumed for image contents during message tokenization.
export const IMAGE_CONTENT_TOKEN_COUNT = 3_100;

export type ConversationImagePruningStats = {
  imageCountLimit?: number;
  prunedImageCount: number;
  nonToolImageCount: number;
};

type ToolImageReference = {
  node: ToolResultNode;
  contentIndex: number;
  image: ImageContent;
  retained: boolean;
};

const FILES_CAT_TOOL_NAME = getPrefixedToolName(
  FILES_SERVER_NAME,
  FILES_CAT_ACTION_NAME
);

function makeWindowMessageNode(message: MessageWithTokens): WindowMessageNode {
  if (message.role === "function") {
    return {
      kind: "tool_result",
      message,
      tokenSavings: getToolResultTokenSavings(message),
      pruned: false,
      eligible: false,
      imageReferences: [],
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
 * Model image limits are enforced during the same replay. Old tool-result previews are replaced
 * first, while images from user input are preserved.
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

  private toolImages: ToolImageReference[] = [];
  private nextToolImageIndex = 0;
  private retainedImageCount = 0;
  private totalImageCount = 0;
  private nonToolImageCount = 0;
  private prunedImageCount = 0;

  private constructor(
    private readonly options: {
      pruningBudget: number;
      budgetForInteractions: number;
      maxInputImages?: number;
      logDetails: Record<string, unknown>;
    }
  ) {}

  static empty(options: {
    pruningBudget: number;
    budgetForInteractions: number;
    maxInputImages?: number;
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

      this.registerImages(node);
      this.pruneImagesToLimit();

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
    const { budgetForInteractions, logDetails, maxInputImages } = this.options;

    if (
      maxInputImages !== undefined &&
      this.nonToolImageCount >= maxInputImages
    ) {
      logger.warn(
        {
          ...logDetails,
          imageCountLimit: maxInputImages,
          nonToolImageCount: this.nonToolImageCount,
          totalImageCount: this.totalImageCount,
        },
        "Conversation contains images that cannot be pruned to the model input limit."
      );
    }

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

  imagePruningStats(): ConversationImagePruningStats {
    return {
      imageCountLimit: this.options.maxInputImages,
      prunedImageCount: this.prunedImageCount,
      nonToolImageCount: this.nonToolImageCount,
    };
  }

  private latestInteractionHasPrunedToolResults(): boolean {
    const latestInteraction = this.interactions[this.interactions.length - 1];

    return latestInteraction.messages.some(
      (node) => node.kind === "tool_result" && node.pruned
    );
  }

  private registerImages(node: WindowMessageNode): void {
    if (this.options.maxInputImages === undefined) {
      return;
    }

    const { message } = node;
    if (!("content" in message) || !Array.isArray(message.content)) {
      return;
    }

    for (const [contentIndex, content] of message.content.entries()) {
      if (!isImageContent(content)) {
        continue;
      }

      this.totalImageCount += 1;
      this.retainedImageCount += 1;

      if (node.kind === "tool_result") {
        const reference = {
          node,
          contentIndex,
          image: content,
          retained: true,
        };
        node.imageReferences.push(reference);
        this.toolImages.push(reference);
      } else {
        this.nonToolImageCount += 1;
      }
    }
  }

  private pruneImagesToLimit(): void {
    const { maxInputImages } = this.options;
    if (maxInputImages === undefined) {
      return;
    }

    while (
      this.retainedImageCount > maxInputImages &&
      this.nextToolImageIndex < this.toolImages.length
    ) {
      const reference = this.toolImages[this.nextToolImageIndex];
      this.nextToolImageIndex += 1;

      if (!reference.retained) {
        continue;
      }

      const { node, contentIndex, image } = reference;
      if (!Array.isArray(node.message.content)) {
        throw new Error("Expected structured tool content");
      }
      const replacement = {
        type: "text" as const,
        text:
          `[This image preview is no longer displayed because the conversation exceeds the ${maxInputImages}-image limit.` +
          (image.file_path
            ? ` Use \`${FILES_CAT_TOOL_NAME}\` with path \`${image.file_path}\` to display it again.]`
            : " Re-run the tool to display it again.]"),
      };
      reference.retained = false;
      this.retainedImageCount -= 1;
      this.prunedImageCount += 1;

      const previousTokenCount = node.message.tokenCount;
      const previousTokenSavings = node.tokenSavings;
      // UTF-8 bytes are a conservative token estimate that also covers the variable file path
      // without introducing another tokenizer call during replay.
      const replacementTokenCount = Buffer.byteLength(replacement.text);
      const content = [...node.message.content];
      content[contentIndex] = replacement;
      node.message = {
        ...node.message,
        content,
        tokenCount: Math.max(
          previousTokenCount -
            IMAGE_CONTENT_TOKEN_COUNT +
            replacementTokenCount,
          0
        ),
      };
      node.tokenSavings = getToolResultTokenSavings(node.message);

      const tokenDelta = node.message.tokenCount - previousTokenCount;
      this.retainedTokens += tokenDelta;
      this.totalTokensBefore += tokenDelta;
      if (node.eligible) {
        this.eligibleToolResultTokenSavings +=
          node.tokenSavings - previousTokenSavings;
      }
    }
  }

  private releaseToolResultImages(node: ToolResultNode): void {
    for (const reference of node.imageReferences) {
      if (reference.retained) {
        reference.retained = false;
        this.retainedImageCount -= 1;
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
        node.eligible = true;
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

      this.releaseToolResultImages(node);
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
