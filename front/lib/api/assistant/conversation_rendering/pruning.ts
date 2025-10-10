/**
 * Pruning utilities for tool results in conversation rendering
 */

import type { ModelMessageTypeMultiActions } from "@app/types";

import {
  PRUNED_RESULT_PLACEHOLDER,
  PRUNED_TOOL_RESULT_TOKENS,
} from "./shared/token_utils";

export type MessageWithTokens = ModelMessageTypeMultiActions & {
  tokenCount: number;
};

export type InteractionWithTokens = {
  messages: MessageWithTokens[];
};

/**
 * Prunes all tool results in an interaction.
 * Returns a new interaction with all tool results replaced by placeholders.
 */
export function pruneAllToolResults(
  interaction: InteractionWithTokens
): InteractionWithTokens {
  const prunedMessages = interaction.messages.map((msg) => {
    if (msg.role === "function") {
      return {
        ...msg,
        content: PRUNED_RESULT_PLACEHOLDER,
        tokenCount: PRUNED_TOOL_RESULT_TOKENS,
      };
    }
    return msg;
  });

  return {
    messages: prunedMessages,
  };
}

/**
 * Calculate total tokens for an interaction
 */
export function getInteractionTokenCount(
  interaction: InteractionWithTokens
): number {
  return interaction.messages.reduce((sum, msg) => sum + msg.tokenCount, 0);
}

/**
 * Progressively prune tool results from an interaction to meet token budget
 * Prunes from oldest to newest tool results until the interaction fits.
 */
export async function progressivelyPruneInteraction(
  interaction: InteractionWithTokens,
  maxTokens: number
): Promise<InteractionWithTokens> {
  const currentTokens = getInteractionTokenCount(interaction);
  if (currentTokens <= maxTokens) {
    return interaction;
  }

  // Find all tool result messages
  const toolResultIndices: number[] = [];
  for (let i = 0; i < interaction.messages.length; i++) {
    if (interaction.messages[i].role === "function") {
      toolResultIndices.push(i);
    }
  }

  // Prune from oldest to newest, recalculating tokens each time
  let prunedMessages = [...interaction.messages];
  for (const index of toolResultIndices) {
    const message = prunedMessages[index];
    if (
      message.role === "function" &&
      message.content !== PRUNED_RESULT_PLACEHOLDER
    ) {
      // Create a new array with the pruned message.
      prunedMessages = [...prunedMessages];
      prunedMessages[index] = {
        ...message,
        content: PRUNED_RESULT_PLACEHOLDER,
        tokenCount: PRUNED_TOOL_RESULT_TOKENS,
      };

      // Check if we've pruned enough.
      const newTotalTokens = prunedMessages.reduce(
        (sum, msg) => sum + msg.tokenCount,
        0
      );
      if (newTotalTokens <= maxTokens) {
        break;
      }
    }
  }

  return {
    messages: prunedMessages,
  };
}
