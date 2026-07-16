/**
 * Mechanisms for fitting a conversation into a token budget. Two distinct operations, named
 * consistently throughout this module and index.ts:
 *
 * - "prune" (pruneToolResults): replace a tool result's content with a small placeholder. The
 *   message stays in place, so tool_use/tool_result pairing is never broken.
 * - "drop" (dropInteractionsToFit): remove whole interactions entirely, oldest first.
 *
 * index.ts owns the policy of when to apply which. This module owns the mechanisms.
 */
import type { Interaction } from "@app/lib/api/assistant/conversation/interactions";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import assert from "assert";

const PRUNED_TOOL_RESULT_PLACEHOLDER =
  "<dust_system>" +
  "This tool result is no longer available (pruned to prevent context window overflow)." +
  "</dust_system>";
const PRUNED_TOOL_RESULT_TOKENS = 24;

// Pruning advances through history in batches of this size, not message by message. Every move
// of the pruning frontier invalidates the provider cache from that point on. Moving it for a
// handful of tokens costs more than it saves, so it only moves once a batch has accumulated.
// Flat rather than a percentage of contextSize since no model in our fleet sits between 16k-64k
// tokens. Starting point, tune against production cache-miss metrics.
export const PRUNING_CHECKPOINT_TOKENS = 20_000;

// Batch size for drops. Same starting value as PRUNING_CHECKPOINT_TOKENS but a separate knob.
// A drop invalidates the cache from the very first message, pruning only from its frontier, so
// a drop miss costs more and may deserve a larger batch. Tune independently.
export const DROP_CHECKPOINT_TOKENS = 20_000;

// How many of the most recent tool results pruneToolResults never prunes, regardless of budget.
// Counted in tool results, not turns: a single turn's own long tool-call chain is eligible for
// pruning past this window exactly like an older turn's would be. Starting point, tune against
// production metrics.
export const TOOL_RESULTS_TO_PRESERVE = 10;

export type MessageWithTokens = ModelMessageTypeMultiActions & {
  tokenCount: number;
  // Protected messages keep both their own content and the interaction containing them.
  isProtectedFromPruning?: boolean;
};

export type InteractionWithTokens = Interaction<MessageWithTokens>;

/** Turns a function-role message into the pruned placeholder. */
function pruneToolResultMessage(
  message: Extract<MessageWithTokens, { role: "function" }>
): Extract<MessageWithTokens, { role: "function" }> {
  return {
    ...message,
    content: PRUNED_TOOL_RESULT_PLACEHOLDER,
    tokenCount: PRUNED_TOOL_RESULT_TOKENS,
  };
}

/** Total tokens across an interaction's messages. */
export function getInteractionTokenCount(
  interaction: InteractionWithTokens
): number {
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

/**
 * Re-slices a flat message array back into template's interaction boundaries. Safe because
 * pruneToolResultsFlat never adds, removes, or reorders messages. Throws if that's ever violated.
 */
function sliceIntoInteractions(
  template: InteractionWithTokens[],
  messages: MessageWithTokens[]
): InteractionWithTokens[] {
  const expectedLength = template.reduce(
    (sum, interaction) => sum + interaction.messages.length,
    0
  );

  assert(
    messages.length === expectedLength,
    `sliceIntoInteractions: message count mismatch (expected ${expectedLength}, got ${messages.length}). Pruning must never add, remove, or reorder messages.`
  );

  const result: InteractionWithTokens[] = [];
  let offset = 0;
  for (const interaction of template) {
    const count = interaction.messages.length;
    result.push({ messages: messages.slice(offset, offset + count) });
    offset += count;
  }
  return result;
}

/** The flat algorithm behind pruneToolResults. See that function for the full contract. */
function pruneToolResultsFlat(
  messages: MessageWithTokens[],
  {
    maxTokens,
    toolResultsToPreserve,
  }: {
    maxTokens: number;
    toolResultsToPreserve: number;
  }
): MessageWithTokens[] {
  const n = messages.length;
  if (n === 0) {
    return messages;
  }

  // Prefix sum from the start of the conversation. The value at a fixed index never changes once
  // that message is history.
  const originalTokens = messages.map((m) => m.tokenCount);
  const prefixSum: number[] = [];
  let running = 0;
  for (const tokens of originalTokens) {
    running += tokens;
    prefixSum.push(running);
  }

  // Common case: everything already fits, nothing to decide.
  const totalIfNothingPruned = prefixSum[n - 1];
  if (totalIfNothingPruned <= maxTokens) {
    return messages;
  }

  // prunedTokens is what each message would cost once pruned, capped at its original size so a
  // tool result already smaller than the placeholder is never reported as shrinking.
  const prunedTokens = messages.map((m, i) =>
    m.role === "function"
      ? Math.min(originalTokens[i], PRUNED_TOOL_RESULT_TOKENS)
      : originalTokens[i]
  );

  const functionIndices: number[] = [];
  for (let i = 0; i < n; i++) {
    if (
      messages[i].role === "function" &&
      !messages[i].isProtectedFromPruning
    ) {
      functionIndices.push(i);
    }
  }

  // Last toolResultsToPreserve tool results: never pruned, regardless of budget.
  const floorStart = Math.max(
    functionIndices.length - toolResultsToPreserve,
    0
  );
  // Excludes results already smaller than the placeholder (e.g. "ok"). Pruning one would grow
  // it, not shrink it, breaking the budget guarantee below.
  //
  // eligible holds indices into messages. The frontier variables below are indices into eligible
  // itself (its k-th entry), not into messages.
  const eligible = functionIndices
    .slice(0, floorStart)
    .filter((idx) => prunedTokens[idx] < originalTokens[idx]);

  // Minimal pruning needed: walk oldest-to-newest until the running total fits.
  let total = totalIfNothingPruned;
  let neededFrontier = -1;
  for (let k = 0; k < eligible.length && total > maxTokens; k++) {
    const idx = eligible[k];
    total -= originalTokens[idx] - prunedTokens[idx];
    neededFrontier = k;
  }

  if (neededFrontier < 0) {
    return messages;
  }

  // Round forward to the next checkpoint (a prefix-sum multiple of PRUNING_CHECKPOINT_TOKENS) so
  // the same boundary keeps holding for several turns instead of creeping forward on every one.
  // If no checkpoint exists in the remaining eligible range, the frontier runs to the end of it:
  // over-pruning is acceptable, undershooting the budget is not.
  let effectiveFrontier = neededFrontier;
  for (let k = neededFrontier; k < eligible.length; k++) {
    effectiveFrontier = k;
    const idx = eligible[k];
    if (idx === 0) {
      break; // Start of conversation is trivially a checkpoint.
    }
    const bucketAtIdx = Math.floor(prefixSum[idx] / PRUNING_CHECKPOINT_TOKENS);
    const bucketBefore = Math.floor(
      prefixSum[idx - 1] / PRUNING_CHECKPOINT_TOKENS
    );
    if (bucketAtIdx !== bucketBefore) {
      break;
    }
  }

  const toPrune = new Set(eligible.slice(0, effectiveFrontier + 1));

  return messages.map((m, i) =>
    m.role === "function" && toPrune.has(i) ? pruneToolResultMessage(m) : m
  );
}

/**
 * Prunes tool results across the whole conversation, previous interactions and the current,
 * in-progress one combined, as one flat sequence, oldest eligible first. No exemption for the
 * current turn: a long tool-call chain within it becomes eligible past toolResultsToPreserve
 * exactly like an older turn's would.
 *
 * Takes and returns `InteractionWithTokens[]`, flattening and re-slicing internally so callers
 * never juggle a flat view and an interaction view themselves. Only ever replaces a function
 * message's content. Never removes or reorders a message, so every tool_use stays paired with a
 * tool_result and a content fragment is never separated from its user message. Dropping whole
 * turns when pruning alone isn't enough is a separate operation (dropInteractionsToFit) for
 * exactly that reason.
 *
 * Everything here is recomputed from scratch on every call. Cache stability therefore depends
 * on this function making the same decisions every time. It does, provided its inputs hold
 * still: the history is immutable by nature, and maxTokens must be roughly stable across turns.
 * Small drift in maxTokens is fine (the caller derives it from prompt and tool sizes, which
 * move a little), because the checkpoint rounding absorbs anything well below
 * PRUNING_CHECKPOINT_TOKENS. What breaks stability is a maxTokens that changes on every call,
 * like a remaining budget, a timestamp, or a message count.
 */
export function pruneToolResults(
  interactions: InteractionWithTokens[],
  opts: {
    maxTokens: number;
    toolResultsToPreserve: number;
  }
): InteractionWithTokens[] {
  const messages = interactions.flatMap((interaction) => interaction.messages);
  const pruned = pruneToolResultsFlat(messages, opts);
  if (pruned === messages) {
    return interactions; // No-op: same reference, same as dropInteractionsToFit below.
  }
  return sliceIntoInteractions(interactions, pruned);
}

/**
 * Drops whole interactions entirely, oldest first, when pruning alone (pruneToolResults) isn't
 * enough. Whole interactions only, since partial drops risk orphaning a tool_use or separating a
 * content fragment from its user message.
 *
 * Never drops into the last interactionsToPreserve. A caller still over budget after that can
 * retry with a smaller floor, or force pruneToolResults deeper.
 * Interactions containing a protected message never count toward that floor and are never dropped.
 *
 * batchToCheckpoint decides how much to drop beyond the strict minimum.
 *
 * With batchToCheckpoint true, the drop extends past the minimal fit to the next checkpoint (a
 * DROP_CHECKPOINT_TOKENS multiple in the prefix sums). Why: any drop invalidates the provider
 * cache entirely, since the cache matches on prefixes and a drop changes the first message.
 * Batching cannot make one drop cheaper. What it does is make drops rare. The extra room means
 * the next several turns fit without dropping again. A conversation sitting at its budget would
 * otherwise re-drop, and pay a full cache miss, on every single call. Exception: when no
 * checkpoint exists before the floor, the drop stays minimal. Extending to the floor would
 * erase content without gaining any stability.
 *
 * With batchToCheckpoint false, the drop is exactly minimal. This is for last-resort callers
 * that are already cutting into recent interactions and should cut as few as possible.
 *
 * One ordering rule keeps the checkpoints meaningful: this function must run after pruning,
 * with a budget at most as tight as pruning's. Checkpoints only stabilize the drop boundary if
 * the prefix sums are identical from one call to the next. That holds because by the time a
 * conversation drops at all, everything prunable in the droppable range was already pruned, so
 * the token counts there no longer change. Dropping with a looser budget than pruning would
 * silently bring back a moving drop boundary on every call.
 */
export function dropInteractionsToFit(
  interactions: InteractionWithTokens[],
  {
    maxTokens,
    interactionsToPreserve,
    batchToCheckpoint,
  }: {
    maxTokens: number;
    interactionsToPreserve: number;
    batchToCheckpoint: boolean;
  }
): InteractionWithTokens[] {
  const protectedTokenCount = interactions.reduce(
    (sum, interaction) =>
      interaction.messages.some((message) => message.isProtectedFromPruning)
        ? sum + getInteractionTokenCount(interaction)
        : sum,
    0
  );
  const droppableInteractions = interactions.filter(
    (interaction) =>
      !interaction.messages.some((message) => message.isProtectedFromPruning)
  );
  const maxTokensForDroppableInteractions = maxTokens - protectedTokenCount;
  const n = droppableInteractions.length;
  const floorStart = Math.max(n - interactionsToPreserve, 0);

  // Prefix sum over interactions, from the start of the conversation.
  const prefixSum: number[] = [];
  let running = 0;
  for (const interaction of droppableInteractions) {
    running += getInteractionTokenCount(interaction);
    prefixSum.push(running);
  }

  if (n === 0 || prefixSum[n - 1] <= maxTokensForDroppableInteractions) {
    return interactions;
  }

  // Minimal drop needed: walk oldest-to-newest until the remaining total fits.
  let remaining = prefixSum[n - 1];
  let dropUpToIndex = -1;
  for (
    let i = 0;
    i < floorStart && remaining > maxTokensForDroppableInteractions;
    i++
  ) {
    remaining -= getInteractionTokenCount(droppableInteractions[i]);
    dropUpToIndex = i;
  }
  if (dropUpToIndex < 0) {
    return interactions;
  }

  if (batchToCheckpoint) {
    // Extend the drop to the first checkpoint at or past the minimal point. The minimal point
    // moves with the caller's budget. The checkpoints don't, so consecutive calls land on the
    // same boundary. Index 0 compares against prefix sum 0, which lets the very first drop of a
    // conversation reach a real checkpoint too, instead of dropping one interaction now and
    // re-dropping on the next call.
    for (let i = dropUpToIndex; i < floorStart; i++) {
      const bucketAtIdx = Math.floor(prefixSum[i] / DROP_CHECKPOINT_TOKENS);
      const bucketBefore =
        i === 0 ? 0 : Math.floor(prefixSum[i - 1] / DROP_CHECKPOINT_TOKENS);
      if (bucketAtIdx !== bucketBefore) {
        dropUpToIndex = i;
        break;
      }
    }
  }

  let droppableIndex = 0;
  return interactions.filter((interaction) => {
    if (
      interaction.messages.some((message) => message.isProtectedFromPruning)
    ) {
      return true;
    }

    return droppableIndex++ > dropUpToIndex;
  });
}
