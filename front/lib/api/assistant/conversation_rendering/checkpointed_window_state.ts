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
import { assertNever } from "@app/types/shared/utils/assert_never";
import { z } from "zod";

type RegularMessageNode = {
  kind: "message";
  message: MessageWithTokens;
};

type ToolResultNode = {
  kind: "tool_result";
  message: Extract<MessageWithTokens, { role: "function" }>;
  tokenSavings: number;
  pruned: boolean;
  phase: "pending" | "eligible" | "consumed";
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

export const CONVERSATION_WINDOW_STATE_SNAPSHOT_VERSION = 1;

const modelContentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), text: z.string() }).strict(),
  z
    .object({
      type: z.literal("image_url"),
      image_url: z.object({ url: z.string() }).strict(),
    })
    .strict(),
]);

const functionCallSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    arguments: z.string(),
    namespace: z.string().optional(),
    metadata: z
      .object({ thoughtSignature: z.string().optional() })
      .strict()
      .optional(),
  })
  .strict();

const assistantContentSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("text_content"),
      value: z.string(),
      metadata: z
        .object({ phase: z.enum(["commentary", "final_answer"]).optional() })
        .passthrough()
        .optional(),
    })
    .strict(),
  z
    .object({
      type: z.literal("reasoning"),
      value: z
        .object({
          reasoning: z.string().optional(),
          metadata: z.string(),
          tokens: z.number().int().nonnegative(),
          provider: z.string(),
          region: z.string().nullable().optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({ type: z.literal("function_call"), value: functionCallSchema })
    .strict(),
  z
    .object({
      type: z.literal("provider_passthrough"),
      value: z.object({ provider: z.string(), block: z.unknown() }).strict(),
    })
    .strict(),
]);

const tokenCountSchema = z.number().int().nonnegative();
const persistedMessageBaseSchema = z.discriminatedUnion("role", [
  z
    .object({
      role: z.literal("user"),
      name: z.string(),
      content: z.array(modelContentSchema),
      tokenCount: tokenCountSchema,
    })
    .strict(),
  z
    .object({
      role: z.literal("content_fragment"),
      name: z.string(),
      content: z.array(modelContentSchema),
      tokenCount: tokenCountSchema,
    })
    .strict(),
  z
    .object({
      role: z.literal("assistant"),
      name: z.string().optional(),
      content: z.string().optional(),
      function_calls: z.array(functionCallSchema).optional(),
      contents: z.array(assistantContentSchema),
      tokenCount: tokenCountSchema,
    })
    .strict(),
  z
    .object({
      role: z.literal("function"),
      name: z.string(),
      function_call_id: z.string(),
      content: z.union([z.string(), z.array(modelContentSchema)]),
      tokenCount: tokenCountSchema,
    })
    .strict(),
  z
    .object({
      role: z.literal("compaction"),
      content: z.string(),
      tokenCount: tokenCountSchema,
    })
    .strict(),
]);

const persistedMessageSchema = persistedMessageBaseSchema.superRefine(
  (message, context) => {
    if (
      message.role === "assistant" &&
      message.name === undefined &&
      message.function_calls === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "Assistant message requires a name or function calls",
      });
    }
  }
);

const messageWithTokensSchema = z.custom<MessageWithTokens>(
  (value) => persistedMessageSchema.safeParse(value).success,
  "Invalid checkpointed model message"
);
const windowMessageNodeSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("message"),
      message: messageWithTokensSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("tool_result"),
      message: z.custom<Extract<MessageWithTokens, { role: "function" }>>(
        (value) => {
          const result = persistedMessageSchema.safeParse(value);
          return result.success && result.data.role === "function";
        },
        "Invalid checkpointed tool result"
      ),
      tokenSavings: z.number().int().nonnegative(),
      pruned: z.boolean(),
      phase: z.enum(["pending", "eligible", "consumed"]),
    })
    .strict(),
]);

export const ConversationWindowStateSnapshotSchema = z
  .object({
    version: z.literal(CONVERSATION_WINDOW_STATE_SNAPSHOT_VERSION),
    interactions: z.array(
      z.object({ messages: z.array(windowMessageNodeSchema) }).strict()
    ),
    retainedTokens: z.number().int().nonnegative(),
    totalTokensBefore: z.number().int().nonnegative(),
    prunedTokens: z.number().int().nonnegative(),
  })
  .strict()
  .superRefine((snapshot, context) => {
    let retainedTokens = 0;
    let prunedTokens = 0;

    for (const [
      interactionIndex,
      interaction,
    ] of snapshot.interactions.entries()) {
      for (const [messageIndex, node] of interaction.messages.entries()) {
        retainedTokens += node.message.tokenCount;
        switch (node.kind) {
          case "message":
            break;
          case "tool_result": {
            const path = [
              "interactions",
              interactionIndex,
              "messages",
              messageIndex,
            ];
            if (node.pruned) {
              prunedTokens += node.tokenSavings;
              if (node.phase !== "consumed" || node.tokenSavings === 0) {
                context.addIssue({
                  code: "custom",
                  path,
                  message: "Pruned tool result has an inconsistent phase",
                });
              }
            } else if (
              (node.phase === "eligible" && node.tokenSavings === 0) ||
              (node.phase === "consumed" && node.tokenSavings !== 0)
            ) {
              context.addIssue({
                code: "custom",
                path,
                message: "Unpruned tool result has an inconsistent phase",
              });
            }
            break;
          }
          default:
            assertNever(node);
        }
      }
    }

    if (retainedTokens !== snapshot.retainedTokens) {
      context.addIssue({
        code: "custom",
        message: "Checkpoint retained token count is inconsistent",
      });
    }
    if (
      snapshot.retainedTokens + snapshot.prunedTokens !==
      snapshot.totalTokensBefore
    ) {
      context.addIssue({
        code: "custom",
        message: "Checkpoint total token count is inconsistent",
      });
    }
    if (prunedTokens !== snapshot.prunedTokens) {
      context.addIssue({
        code: "custom",
        message: "Checkpoint pruned token count is inconsistent",
      });
    }
  });

export type ConversationWindowStateSnapshot = z.infer<
  typeof ConversationWindowStateSnapshotSchema
>;

export const MINIMUM_PRUNING_BATCH_TOKENS = 5_000;

function makeWindowMessageNode(message: MessageWithTokens): WindowMessageNode {
  if (message.role === "function") {
    return {
      kind: "tool_result",
      message,
      tokenSavings: getToolResultTokenSavings(message),
      pruned: false,
      phase: "pending",
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

  static empty(options: {
    pruningBudget: number;
    budgetForInteractions: number;
    logDetails: Record<string, unknown>;
  }): CheckpointedConversationWindowState {
    return new CheckpointedConversationWindowState(options);
  }

  static restore(
    snapshot: ConversationWindowStateSnapshot,
    options: {
      pruningBudget: number;
      budgetForInteractions: number;
      logDetails: Record<string, unknown>;
    }
  ): CheckpointedConversationWindowState {
    const state = new CheckpointedConversationWindowState(options);
    state.interactions = structuredClone(snapshot.interactions);
    state.retainedTokens = snapshot.retainedTokens;
    state.totalTokensBefore = snapshot.totalTokensBefore;
    state.prunedTokens = snapshot.prunedTokens;

    for (const interaction of state.interactions) {
      for (const node of interaction.messages) {
        switch (node.kind) {
          case "message":
            break;

          case "tool_result":
            switch (node.phase) {
              case "pending":
                state.pendingToolResults.push({ phase: "pending", node });
                break;

              case "eligible":
                state.eligibleToolResults.push({ phase: "eligible", node });
                state.eligibleToolResultTokenSavings += node.tokenSavings;
                break;

              case "consumed":
                break;

              default:
                assertNever(node.phase);
            }
            break;
          default:
            assertNever(node);
        }
      }
    }

    return state;
  }

  snapshot(): ConversationWindowStateSnapshot {
    return {
      version: CONVERSATION_WINDOW_STATE_SNAPSHOT_VERSION,
      interactions: structuredClone(this.interactions),
      retainedTokens: this.retainedTokens,
      totalTokensBefore: this.totalTokensBefore,
      prunedTokens: this.prunedTokens,
    };
  }

  append(interaction: InteractionWithTokens): void {
    if (interaction.messages.length === 0) {
      return;
    }

    const messages = this.appendMessages(interaction.messages);
    this.interactions.push({ messages });
  }

  appendToLatestInteraction(interaction: InteractionWithTokens): void {
    if (interaction.messages.length === 0) {
      return;
    }

    const latestInteractionIndex = this.interactions.length - 1;
    const latestInteraction = this.interactions[latestInteractionIndex];
    if (!latestInteraction) {
      this.append(interaction);
      return;
    }

    const messages = this.appendMessages(interaction.messages);
    this.interactions[latestInteractionIndex] = {
      messages: [...latestInteraction.messages, ...messages],
    };
  }

  private appendMessages(
    messages: InteractionWithTokens["messages"]
  ): WindowMessageNode[] {
    const nodes: WindowMessageNode[] = [];
    for (let messageIndex = 0; messageIndex < messages.length; messageIndex++) {
      const message = messages[messageIndex];
      const nextMessage = messages[messageIndex + 1];

      if (message.role === "assistant") {
        this.makePendingToolResultsEligible();
      }

      const node = makeWindowMessageNode(message);
      nodes.push(node);
      this.retainedTokens += message.tokenCount;
      this.totalTokensBefore += message.tokenCount;

      if (node.kind === "tool_result") {
        this.pendingToolResults.push({ phase: "pending", node });
      }

      if (this.isModelInputCheckpoint(message, nextMessage)) {
        this.applyBufferedPruning();
      }
    }

    return nodes;
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
        node.phase = "eligible";
        this.eligibleToolResults.push({ phase: "eligible", node });
        this.eligibleToolResultTokenSavings += node.tokenSavings;
      } else {
        node.phase = "consumed";
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
      node.phase = "consumed";
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
