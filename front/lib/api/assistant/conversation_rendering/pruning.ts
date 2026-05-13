import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";

const PRUNED_TOOL_RESULT_PLACEHOLDER =
  "<dust_system>" +
  "This tool result is no longer available (pruned to prevent context window overflow)." +
  "</dust_system>";
const PRUNED_TOOL_RESULT_TOKENS = 24;

export type MessageWithTokens = ModelMessageTypeMultiActions & {
  tokenCount: number;
};

export type MinimalMessageType = {
  role: string;
};

export type Interaction<T extends MinimalMessageType> = {
  messages: T[];
  prunedContext?: boolean;
};

export type InteractionWithTokens = Interaction<MessageWithTokens>;

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
        content: PRUNED_TOOL_RESULT_PLACEHOLDER,
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
 * Calculate total tokens for an interaction.
 */
export function getInteractionTokenCount(
  interaction: InteractionWithTokens
): number {
  return interaction.messages.reduce((sum, msg) => sum + msg.tokenCount, 0);
}

/**
 * Progressively prune tool results from an interaction to meet token budget. Prunes from oldest to
 * newest tool results until the interaction fits.
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

  let prunedContext = false;

  // Prune from oldest to newest, recalculating tokens each time.
  let prunedMessages = [...interaction.messages];
  for (const index of toolResultIndices) {
    // If very last tool result is pruned, we mark prunedContext as true.
    if (index === toolResultIndices[toolResultIndices.length - 1]) {
      prunedContext = true;
    }
    const message = prunedMessages[index];
    if (message.role === "function") {
      // Create a new array with the pruned message.
      prunedMessages = [...prunedMessages];
      prunedMessages[index] = {
        ...message,
        content: PRUNED_TOOL_RESULT_PLACEHOLDER,
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
    prunedContext,
  };
}

/**
 * Prunes all tool results from a list of interactions, attempting to fully preserve up to n
 * interactions (starting from the last). As soon as we reach n interactions, or as soon as an
 * interaction does not fit within the token budget, we'll fully prune the remaining interactions.
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
    // We prune if we've pruned the last interaction, or if we've reached the number of interactions
    // to preserve.
    shouldPrune =
      shouldPrune || i < interactions.length - interactionsToPreserve;

    let interactionTokens = getInteractionTokenCount(interactions[i]);
    if (interactionTokens > availableTokens) {
      // If the interaction does not fit the context we prune it and prune all the ones after.
      shouldPrune = true;
    }

    if (shouldPrune) {
      // We are pruning all previous interactions. We simply prune all tool results and update the
      // available tokens.
      interactions[i] = pruneAllToolResults(interactions[i]);
      interactionTokens = getInteractionTokenCount(interactions[i]);
    }

    // We update the available tokens.
    availableTokens -= interactionTokens;
  }

  return interactions;
}
