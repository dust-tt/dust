import type { MessageTypeMultiActions } from "@app/types";

const CURRENT_INTERACTION_PRUNED_RESULT_PLACEHOLDER =
  "<dust_system>This function result is no longer available." +
  " Warning: the content of this function result was pruned to prevent context window overflow.</dust_system>";
const CURRENT_INTERACTION_PRUNED_TOOL_RESULT_TOKENS = 40;

const PREVIOUS_INTERACTIONS_PRUNED_RESULT_PLACEHOLDER =
  "<dust_system>This function result is no longer available.</dust_system>";
const PREVIOUS_INTERACTIONS_PRUNED_TOOL_RESULT_TOKENS = 20;

export type MessageWithTokens = MessageTypeMultiActions & {
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
        content: PREVIOUS_INTERACTIONS_PRUNED_RESULT_PLACEHOLDER,
        tokenCount: PREVIOUS_INTERACTIONS_PRUNED_TOOL_RESULT_TOKENS,
      };
    }
    return msg;
  });

  return {
    messages: prunedMessages,
  };
}

/**
 * Calculate total tokens for an interaction.
 */
export function getInteractionTokenCount(
  interaction: InteractionWithTokens
): number {
  return interaction.messages.reduce((sum, msg) => sum + msg.tokenCount, 0);
}

/**
 * Progressively prune tool results from an interaction to meet token budget.
 * Prunes from oldest to newest tool results until the interaction fits.
 */
export function progressivelyPruneInteraction(
  interaction: InteractionWithTokens,
  maxTokens: number
): InteractionWithTokens {
  const currentTokens = getInteractionTokenCount(interaction);
  if (currentTokens <= maxTokens) {
    return interaction;
  }

  // Find all tool result messages.
  const toolResultIndices: number[] = [];
  for (let i = 0; i < interaction.messages.length; i++) {
    if (interaction.messages[i].role === "function") {
      toolResultIndices.push(i);
    }
  }

  // Prune from oldest to newest, recalculating tokens each time.
  let prunedMessages = [...interaction.messages];
  for (const index of toolResultIndices) {
    const message = prunedMessages[index];
    if (message.role === "function") {
      // Create a new array with the pruned message.
      prunedMessages = [...prunedMessages];
      prunedMessages[index] = {
        ...message,
        content: CURRENT_INTERACTION_PRUNED_RESULT_PLACEHOLDER,
        tokenCount: CURRENT_INTERACTION_PRUNED_TOOL_RESULT_TOKENS,
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

/**
 * Prunes all tool results from a list of interactions, attempting to fully preserve up to n interactions (starting from the last).
 * As soon as we reach n interactions, or as soon as an interaction does not fit within the token budget,
 * we'll fully prune the remaining interactions.
 */
export function prunePreviousInteractions(
  inputInteractions: InteractionWithTokens[],
  maxTokens: number,
  interactionsToPreserve: number
): InteractionWithTokens[] {
  const interactions = [...inputInteractions];

  let shouldPrune = false;
  let availableTokens = maxTokens;
  for (let i = interactions.length - 1; i >= 0; i--) {
    // We prune if we've pruned the last interaction, or if we've reached the number of interactions to preserve.
    shouldPrune =
      shouldPrune || i < interactions.length - interactionsToPreserve;

    const interaction = interactions[i];
    if (shouldPrune) {
      // We are pruning all previous interactions.
      // We simply prune all tool results and update the available tokens.
      interactions[i] = pruneAllToolResults(interaction);
      availableTokens -= getInteractionTokenCount(interaction);
      continue;
    }

    // We check if the interaction fits fully.
    // If so, we leave it untouched.
    // Otherwise, we prune it along all previous interactions.
    let interactionTokens = getInteractionTokenCount(interaction);
    if (interactionTokens > availableTokens) {
      // Interaction does not fit within the token budget.
      // We prune it, and will prune all previous interactions as well.
      interactions[i] = pruneAllToolResults(interaction);
      interactionTokens = getInteractionTokenCount(interaction);
      shouldPrune = true;
    } else {
      // Interaction fits within the token budget.
      // We keep it as-is
    }

    // We update the available tokens.
    availableTokens -= interactionTokens;
  }

  return interactions;
}
