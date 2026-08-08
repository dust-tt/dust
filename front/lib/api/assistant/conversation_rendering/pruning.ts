/** Shared token accounting and tool-result pruning helpers. */
import type { Interaction } from "@app/lib/api/assistant/conversation/interactions";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";

const PRUNED_TOOL_RESULT_PLACEHOLDER =
  "<dust_system>" +
  "This tool result is no longer available (pruned to prevent context window overflow)." +
  "</dust_system>";
const PRUNED_TOOL_RESULT_TOKENS = 24;

// Fixed number of tokens assumed for image contents.
export const IMAGE_CONTENT_TOKEN_COUNT = 3_100;

// Pruning advances through history in batches of this size, not message by message. Every move
// of the pruning frontier invalidates the provider cache from that point on. Moving it for a
// handful of tokens costs more than it saves, so it only moves once a batch has accumulated.
// Flat rather than a percentage of contextSize since no model in our fleet sits between 16k-64k
// tokens. Starting point, tune against production cache-miss metrics.
export const PRUNING_CHECKPOINT_TOKENS = 20_000;

export type MessageWithTokens = ModelMessageTypeMultiActions & {
  tokenCount: number;
};

export type InteractionWithTokens = Interaction<MessageWithTokens>;

/** Turns a function-role message into the pruned placeholder. */
export function pruneToolResultMessage(
  message: Extract<MessageWithTokens, { role: "function" }>
): Extract<MessageWithTokens, { role: "function" }> {
  return {
    ...message,
    content: PRUNED_TOOL_RESULT_PLACEHOLDER,
    tokenCount: PRUNED_TOOL_RESULT_TOKENS,
  };
}

/** Total tokens across an interaction's messages. */
function getInteractionTokenCount(interaction: InteractionWithTokens): number {
  return interaction.messages.reduce((sum, msg) => sum + msg.tokenCount, 0);
}

/** Total tokens across every interaction in the array. */
export function sumInteractionTokens(
  interactions: InteractionWithTokens[]
): number {
  return interactions.reduce(
    (sum, interaction) => sum + getInteractionTokenCount(interaction),
    0
  );
}

/** Tokens removed by replacing a tool result with the pruning placeholder. */
export function getToolResultTokenSavings(message: MessageWithTokens): number {
  return message.role === "function"
    ? Math.max(message.tokenCount - PRUNED_TOOL_RESULT_TOKENS, 0)
    : 0;
}
