import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";

const PRUNED_TOOL_RESULT_PLACEHOLDER =
  "<dust_system>" +
  "This tool result is no longer available (pruned to prevent context window overflow)." +
  "</dust_system>";
const PRUNED_TOOL_RESULT_TOKENS = 24;

// Batch granularity for the redaction checkpoint in prunePreviousInteractions. Same idea as the
// `clear_at_least` setting on provider-native context-editing features. Don't invalidate a cached
// prefix for a handful of tokens. Only redact once enough new content has accumulated to make the
// cache-write cost worthwhile.
//
// Picked as roughly 10% of our primary production model's context window (Claude Sonnet 4.6,
// 250,000 tokens), since a single agent turn that runs a couple of tool calls can easily produce
// several thousand tokens on its own, and a smaller checkpoint gets crossed on nearly every turn.
// For models with a much smaller context window, this value being larger than their entire
// budget for previous interactions is safe: the checkpoint search simply never finds a crossing,
// so it falls back to redacting everything eligible once triggered, still stable, just without
// the batching benefit. Still a starting point, tune against production cache-miss metrics.
export const PRUNING_CHECKPOINT_TOKENS = 25_000;

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
 * Prunes tool results from previous interactions to fit within maxTokens, fully preserving the
 * last interactionsToPreserve interactions whenever the budget allows it. Guarantees the returned
 * interactions' combined token count never exceeds maxTokens, short of interactionsToPreserve's
 * own redacted floor alone exceeding it. That's a real out-of-room case left for the caller to
 * handle.
 *
 * The redaction boundary is computed from each interaction's ORIGINAL (pre-redaction) size. That
 * value never changes once an interaction is permanent history. It's then snapped back to the
 * nearest checkpoint in a prefix sum computed from the start of the conversation (see
 * PRUNING_CHECKPOINT_TOKENS). Because both of these are pure functions of immutable history plus
 * fixed constants, the same input history always yields the same redaction decisions across calls.
 * Those decisions only change once enough new content has accumulated to cross the next
 * checkpoint, not on every single turn. That's what keeps the rendered previous interactions
 * byte-stable across most turns and therefore reusable from the model provider's prompt cache.
 * Callers relying on this stability must always pass the SAME maxTokens across turns, not one
 * derived from a live, per-turn quantity like the current interaction's own size. See
 * renderConversationForModel for how that's arranged.
 *
 * If even fully redacting everything outside the floor isn't enough, for example many old
 * interactions whose placeholders alone add up, already-redacted interactions are dropped
 * entirely, oldest first, up to but never into the floor. This is a rare out-of-room
 * fallback, not routine operation.
 */
export function prunePreviousInteractions(
  inputInteractions: InteractionWithTokens[],
  maxTokens: number,
  interactionsToPreserve: number
): InteractionWithTokens[] {
  let interactions = [...inputInteractions];
  const n = interactions.length;
  if (n === 0) {
    return interactions;
  }

  // Original sizes are permanent. They never change once an interaction is history, regardless of
  // how it eventually gets redacted. redactedTokens is what each interaction would cost if
  // redacted, computed without mutating anything yet, purely to size the redaction savings.
  const originalTokens = interactions.map((interaction) =>
    getInteractionTokenCount(interaction)
  );
  const redactedTokens = interactions.map((interaction) =>
    getInteractionTokenCount(pruneAllToolResults(interaction))
  );

  // Prefix sum from the START of the conversation. The value at a fixed index never changes
  // across turns: it only depends on interactions that are already permanent by the time that
  // index exists.
  const prefixSum: number[] = [];
  let running = 0;
  for (const tokens of originalTokens) {
    running += tokens;
    prefixSum.push(running);
  }

  // The last interactionsToPreserve interactions are a hard floor: never redacted by this
  // function, regardless of budget. (If the floor alone exceeds maxTokens, that's a real
  // out-of-room situation handled by the caller's own downstream safety nets, not here.)
  const floorStart = Math.max(n - interactionsToPreserve, 0);

  let totalIfNothingRedacted = 0;
  for (let i = 0; i < n; i++) {
    totalIfNothingRedacted += originalTokens[i];
  }

  if (totalIfNothingRedacted > maxTokens) {
    // Redact starting from the OLDEST eligible interaction forward, tracking the actual running
    // total (not just whether original sizes would exceed budget), until it fits. This is the
    // minimal redaction needed. Nothing above this frontier is touched.
    let total = totalIfNothingRedacted;
    let neededFrontier = -1;
    for (let i = 0; i < floorStart && total > maxTokens; i++) {
      total -= originalTokens[i] - redactedTokens[i];
      neededFrontier = i;
    }

    if (neededFrontier >= 0) {
      // Round the frontier FORWARD to the next checkpoint at or after neededFrontier. A checkpoint
      // is a position where the immutable prefix sum crosses a multiple of
      // PRUNING_CHECKPOINT_TOKENS. This deliberately redacts a bit more than strictly necessary
      // right now, so the same boundary keeps satisfying the budget for several subsequent turns
      // instead of creeping forward by one interaction on almost every single turn. Never extends
      // past floorStart - 1, so the budget is still always respected even if no checkpoint is
      // found in range.
      let effectiveFrontier = neededFrontier;
      for (let i = neededFrontier; i < floorStart; i++) {
        effectiveFrontier = i;
        if (i === 0) {
          // Index 0 is trivially always a checkpoint: it's the start of the conversation.
          break;
        }
        const bucketAtI = Math.floor(prefixSum[i] / PRUNING_CHECKPOINT_TOKENS);
        const bucketBefore = Math.floor(
          prefixSum[i - 1] / PRUNING_CHECKPOINT_TOKENS
        );
        if (bucketAtI !== bucketBefore) {
          // We fell into a different bucket than the previous interaction, so this is a
          // checkpoint too.
          break;
        }
      }

      for (let i = 0; i <= effectiveFrontier; i++) {
        interactions[i] = pruneAllToolResults(interactions[i]);
      }
    }
  }

  let totalTokens = interactions.reduce(
    (sum, interaction) => sum + getInteractionTokenCount(interaction),
    0
  );

  // Still over budget after the redaction pass above. Either many old, already-redacted
  // placeholders add up, or some eligible interactions above the frontier are themselves large.
  // Drop already-redacted-or-eligible interactions entirely, oldest first, up to but never into
  // the floor. This is strictly less disruptive than touching the floor, so it's always tried
  // first.
  let dropUpToIndex = -1;
  for (let i = 0; i < Math.min(floorStart, n) && totalTokens > maxTokens; i++) {
    totalTokens -= getInteractionTokenCount(interactions[i]);
    dropUpToIndex = i;
  }
  if (dropUpToIndex >= 0) {
    interactions = interactions.slice(dropUpToIndex + 1);
  }

  // Absolute last resort: even with every eligible interaction dropped entirely, the floor's own
  // real size alone still doesn't fit. Redact floor interactions too, oldest first. This only
  // kicks in as a last resort, not routine operation, so it's fine for it to be driven by the
  // floor's live size rather than a checkpoint.
  for (let i = 0; i < interactions.length && totalTokens > maxTokens; i++) {
    const before = getInteractionTokenCount(interactions[i]);
    interactions[i] = pruneAllToolResults(interactions[i]);
    totalTokens -= before - getInteractionTokenCount(interactions[i]);
  }

  return interactions;
}
