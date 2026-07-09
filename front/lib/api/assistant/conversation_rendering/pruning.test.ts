import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import type {
  InteractionWithTokens,
  MessageWithTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import {
  getInteractionTokenCount,
  PRUNING_CHECKPOINT_TOKENS,
  pruneAllToolResults,
  prunePreviousInteractions,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

// Never enough to force budget-driven pruning in these tests: they isolate the
// sliding-window rule from the token-budget rule.
const HUGE_BUDGET = 1_000_000;

/**
 * A deterministic pseudo-random number generator, used instead of Math.random() so a failing
 * test prints a seed that reproduces the exact same failure when rerun.
 *
 * This is a linear congruential generator: state = (state * multiplier + increment) mod m,
 * the same simple formula behind C's rand(). 1103515245 and 12345 are its standard multiplier
 * and increment constants. Masking with 0x7fffffff keeps state a positive 31-bit integer, and
 * dividing by that same value scales the result into [0, 1), like Math.random().
 */
function makeDeterministicRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

function withTokens<T extends ModelMessageTypeMultiActions>(
  message: T,
  tokenCount: number
): T & { tokenCount: number } {
  return { ...message, tokenCount };
}

function buildTurnWithSize(
  index: number,
  toolTokens: number
): MessageWithTokens[] {
  return [
    withTokens(
      {
        role: "user" as const,
        name: "user",
        content: [{ type: "text" as const, text: `u${index}` }],
      },
      10
    ),
    withTokens(
      {
        role: "assistant" as const,
        name: "assistant",
        content: `a${index}`,
        contents: [{ type: "text_content" as const, value: `a${index}` }],
      },
      10
    ),
    withTokens(
      {
        role: "function" as const,
        name: `tool_${index}`,
        function_call_id: `tool_${index}_call`,
        content: `result_${index}`,
      },
      toolTokens
    ),
  ];
}

function buildTurn(index: number): MessageWithTokens[] {
  return buildTurnWithSize(index, 10);
}

function toolResultOf(
  interactions: ReturnType<typeof prunePreviousInteractions>,
  index: number
) {
  const message = interactions[index].messages.find(
    (m) => m.role === "function"
  );
  if (!message || message.role !== "function") {
    throw new Error(`Expected interaction ${index} to have a tool result`);
  }
  return message.content;
}

function isRedacted(content: unknown): boolean {
  return typeof content === "string" && content.includes("no longer available");
}

describe("prunePreviousInteractions", () => {
  it("keeps everything untouched when the budget comfortably covers the full history", () => {
    // Unlike the old sliding-window rule, there is no more forced redaction beyond the floor when
    // the budget was never actually a constraint.
    const messages = [1, 2, 3, 4].flatMap(buildTurn);
    const previousInteractions = groupMessagesIntoInteractions(messages);
    const pruned = prunePreviousInteractions(
      previousInteractions,
      HUGE_BUDGET,
      3
    );

    expect(toolResultOf(pruned, 0)).toBe("result_1");
    expect(toolResultOf(pruned, 1)).toBe("result_2");
    expect(toolResultOf(pruned, 2)).toBe("result_3");
    expect(toolResultOf(pruned, 3)).toBe("result_4");
  });

  it("keeps the floor fully intact and redacts only the oldest, over-budget interaction", () => {
    const messages = [1, 2, 3, 4].flatMap((i) => buildTurnWithSize(i, 40)); // 60 tokens each
    const previousInteractions = groupMessagesIntoInteractions(messages);
    // Floor (last 3) alone = 180, comfortably within budget. Adding interaction 1 (60 more) tips
    // it over 230, but redacting interaction 1 alone (60 -> 44) brings it back under.
    const pruned = prunePreviousInteractions(previousInteractions, 230, 3);

    expect(isRedacted(toolResultOf(pruned, 0))).toBe(true);
    expect(toolResultOf(pruned, 1)).toBe("result_2");
    expect(toolResultOf(pruned, 2)).toBe("result_3");
    expect(toolResultOf(pruned, 3)).toBe("result_4");
  });

  it("renders an already-settled old interaction identically across turns when using the same fixed budget, instead of flipping every time a new turn is appended", () => {
    // Same scale as the batching test below: budget = PRUNING_CHECKPOINT_TOKENS, 60-token
    // interactions. n is derived from the budget (comfortably past the point where redaction
    // becomes necessary) rather than hardcoded, so this test stays valid regardless of what
    // PRUNING_CHECKPOINT_TOKENS is currently set to. n and n+1 both sit inside the same stable
    // stretch, so an interaction deep in the already-redacted region (well before the frontier)
    // must render identically whether or not the newest turn has arrived yet.
    const toolTokens = 40;
    const interactionSize = 60; // toolTokens + user/assistant overhead, per buildTurnWithSize
    const floor = 3;
    const budget = PRUNING_CHECKPOINT_TOKENS;
    const n = Math.ceil((budget / interactionSize) * 1.2);
    const DEEP_INDEX = 10; // well before the frontier in both cases

    const buildHistory = (count: number) =>
      groupMessagesIntoInteractions(
        Array.from({ length: count }, (_, i) => i + 1).flatMap((i) =>
          buildTurnWithSize(i, toolTokens)
        )
      );

    const prunedAtN = prunePreviousInteractions(buildHistory(n), budget, floor);
    const prunedAtNPlus1 = prunePreviousInteractions(
      buildHistory(n + 1),
      budget,
      floor
    );

    expect(isRedacted(toolResultOf(prunedAtN, DEEP_INDEX))).toBe(true);
    expect(toolResultOf(prunedAtNPlus1, DEEP_INDEX)).toBe(
      toolResultOf(prunedAtN, DEEP_INDEX)
    );
  });

  it("batches redaction across a checkpoint boundary instead of advancing on every single turn", () => {
    // Interaction size and starting point derived from PRUNING_CHECKPOINT_TOKENS itself (rather
    // than a hardcoded turn count) so this test keeps exercising real batching behavior no matter
    // what that constant is currently set to. n0 is the first turn count where redaction becomes
    // necessary at all; sampling a window right past that point exercises the batching behavior at
    // a realistic scale instead of tiny numbers where every eligible interaction gets redacted in
    // one shot.
    const toolTokens = 40; // interaction = 60 tokens
    const interactionSize = 60;
    const floor = 3;
    const budget = PRUNING_CHECKPOINT_TOKENS;
    const n0 = Math.ceil(budget / interactionSize) + 1;

    const frontierAt = (n: number) => {
      const messages = Array.from({ length: n }, (_, i) => i + 1).flatMap((i) =>
        buildTurnWithSize(i, toolTokens)
      );
      const previous = groupMessagesIntoInteractions(messages);
      const pruned = prunePreviousInteractions(previous, budget, floor);
      return pruned.findIndex((interaction) => {
        const content = toolResultOf([interaction], 0);
        return !isRedacted(content);
      });
    };

    // Once redaction is needed at all (n large enough), the boundary between redacted and full
    // interactions should stay put for a long run of consecutive turns rather than advancing on
    // every single one. Sample a 20-turn window known to sit inside such a stable stretch for
    // these parameters.
    const boundaries = new Set<number>();
    for (let n = n0; n <= n0 + 19; n++) {
      boundaries.add(frontierAt(n));
    }

    expect(boundaries.size).toBeLessThan(5);
  });

  it("never returns interactions whose combined token count exceeds maxTokens, across a wide randomized sweep (short of the floor's own unavoidable minimum)", () => {
    for (let seed = 1; seed <= 2000; seed++) {
      const rng = makeDeterministicRng(seed);
      const n = 1 + Math.floor(rng() * 15);
      const toPreserve = 1 + Math.floor(rng() * 4);
      const items: InteractionWithTokens[] = [];
      for (let i = 0; i < n; i++) {
        const roll = rng();
        const toolTokens =
          roll < 0.1
            ? 20 + Math.floor(rng() * 3000)
            : 5 + Math.floor(rng() * 150);
        items.push({ messages: buildTurnWithSize(i, toolTokens) });
      }
      const maxTokens = 10 + Math.floor(rng() * 500);

      const pruned = prunePreviousInteractions(items, maxTokens, toPreserve);
      const total = pruned.reduce(
        (sum, interaction) => sum + getInteractionTokenCount(interaction),
        0
      );

      // The floor's own redacted-to-the-max size is the true floor of what's achievable. The
      // function can't do better than that even in the rare out-of-room case.
      const floorStart = Math.max(items.length - toPreserve, 0);
      const floorMinimum = items
        .slice(floorStart)
        .reduce(
          (sum, interaction) =>
            sum + getInteractionTokenCount(pruneAllToolResults(interaction)),
          0
        );

      expect(
        total,
        `seed=${seed} n=${n} toPreserve=${toPreserve} maxTokens=${maxTokens} total=${total} floorMinimum=${floorMinimum}`
      ).toBeLessThanOrEqual(Math.max(maxTokens, floorMinimum));
    }
  });

  it("drops already-redacted interactions entirely, oldest first, when even full redaction isn't enough", () => {
    // 6 previous interactions, floor=3, tiny budget: even redacting everything eligible plus the
    // floor won't fit, so the oldest, already-redacted interactions must be dropped entirely.
    const messages = [1, 2, 3, 4, 5, 6].flatMap((i) =>
      buildTurnWithSize(i, 90)
    );
    const previousInteractions = groupMessagesIntoInteractions(messages);
    const pruned = prunePreviousInteractions(previousInteractions, 189, 3);

    expect(pruned.length).toBeLessThan(previousInteractions.length);
    const total = pruned.reduce(
      (sum, interaction) => sum + getInteractionTokenCount(interaction),
      0
    );
    // Whatever remains is at least redacted. The function did everything it could.
    for (const interaction of pruned) {
      expect(isRedacted(toolResultOf([interaction], 0))).toBe(true);
    }
    expect(total).toBeGreaterThan(0);
  });
});

describe("prunePreviousInteractions across a growing conversation (realistic, variable-size workload)", () => {
  // Whether each previous interaction was redacted, keyed by the interaction's OWN identity (its
  // tool name), not its array position. Array position is not a stable identity across turns.
  // Interactions are appended at the end, and the drop-tier can remove interactions from the
  // start, so results from two different turns can't be compared index-by-index. The only valid
  // comparison is "what happened to interaction N specifically?".
  function redactionStatusById(
    interactions: ReturnType<typeof prunePreviousInteractions>
  ): Map<number, "redacted" | "full"> {
    const statusById = new Map<number, "redacted" | "full">();
    for (const interaction of interactions) {
      const fn = interaction.messages.find((m) => m.role === "function");
      if (!fn || fn.role !== "function") {
        throw new Error("Expected a function message in every interaction");
      }
      const id = Number(fn.name.replace("tool_", ""));
      statusById.set(id, isRedacted(fn.content) ? "redacted" : "full");
    }
    return statusById;
  }

  it("keeps most turns byte-stable and never un-redacts an interaction, simulating a long conversation with realistic variable tool-result sizes", () => {
    // Mostly small-to-medium tool results, with an occasional large one. Mirrors the real spread
    // of interaction sizes observed in production (roughly 200 to 9000 characters per tool
    // result).
    const nextRandom = makeDeterministicRng(42);
    const nextInteractionSizeTokens = () =>
      nextRandom() < 0.15
        ? 500 + Math.floor(nextRandom() * 2500) // occasional large tool result
        : 50 + Math.floor(nextRandom() * 400); // typical tool result

    const TOTAL_TURNS = 80;
    const FLOOR = 3;
    // Order of magnitude of a real allowedTokenCount - baseTokens: large enough that many turns
    // of small talk fit before any redaction is needed at all, matching the real production
    // observation that redaction is a late, occasional event, not a per-turn certainty. Kept as a
    // multiple of PRUNING_CHECKPOINT_TOKENS rather than an absolute number, so the checkpoint
    // mechanism always has room to find a crossing regardless of that constant's current value.
    const BUDGET = PRUNING_CHECKPOINT_TOKENS * 4;

    const interactionSizes: number[] = [];
    let mutationTurnCount = 0;
    let reversalCount = 0;
    let statusAtPreviousTurn = new Map<number, "redacted" | "full">();

    for (let turn = 1; turn <= TOTAL_TURNS; turn++) {
      interactionSizes.push(nextInteractionSizeTokens());

      const history = groupMessagesIntoInteractions(
        interactionSizes.flatMap((toolTokens, i) =>
          buildTurnWithSize(i + 1, toolTokens)
        )
      );
      const statusAtThisTurn = redactionStatusById(
        prunePreviousInteractions(history, BUDGET, FLOOR)
      );

      for (const [id, previousStatus] of statusAtPreviousTurn) {
        // Missing from this turn's map means the interaction was dropped entirely. That's also a
        // mutation, just never a reversal (dropped is strictly "more pruned", not less).
        const currentStatus = statusAtThisTurn.get(id);
        if (currentStatus !== previousStatus) {
          mutationTurnCount++;
          if (previousStatus === "redacted" && currentStatus === "full") {
            reversalCount++;
          }
          break; // one mutated interaction is enough to mark this turn as a mutation-turn
        }
      }

      statusAtPreviousTurn = statusAtThisTurn;
    }

    // The fixed budget plus checkpoint-anchored frontier means most turns render previous
    // interactions byte-identically to the turn before. Mutation is the occasional exception, not,
    // as with the old sliding-window rule, something that happens on nearly every turn.
    expect(mutationTurnCount).toBeLessThan(TOTAL_TURNS * 0.2);
    expect(reversalCount).toBe(0);
  });
});
