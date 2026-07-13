import { groupMessagesIntoInteractions } from "@app/lib/api/assistant/conversation/interactions";
import type {
  InteractionWithTokens,
  MessageWithTokens,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import {
  dropInteractionsToFit,
  getInteractionTokenCount,
  pruneToolResults,
} from "@app/lib/api/assistant/conversation_rendering/pruning";
import type { ModelMessageTypeMultiActions } from "@app/types/assistant/generation";
import { describe, expect, it } from "vitest";

// Never enough to force budget-driven pruning in these tests: they isolate the pruning
// mechanism itself from the "is the budget the binding constraint" question.
const HUGE_BUDGET = 1_000_000;

function withTokens<T extends ModelMessageTypeMultiActions>(
  message: T,
  tokenCount: number
): T & { tokenCount: number } {
  return { ...message, tokenCount };
}

function turn(index: number, toolTokens = 10): MessageWithTokens[] {
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

function toolStep(index: number, toolTokens = 10): MessageWithTokens[] {
  return [
    withTokens(
      {
        role: "assistant" as const,
        name: "assistant",
        content: `step_a${index}`,
        contents: [
          {
            type: "function_call" as const,
            value: {
              id: `step_${index}_call`,
              name: `step_tool_${index}`,
              arguments: "{}",
            },
          },
        ],
      },
      10
    ),
    withTokens(
      {
        role: "function" as const,
        name: `step_tool_${index}`,
        function_call_id: `step_${index}_call`,
        content: `step_result_${index}`,
      },
      toolTokens
    ),
  ];
}

function functionMessagesOf(messages: MessageWithTokens[]) {
  return messages.filter(
    (m): m is Extract<MessageWithTokens, { role: "function" }> =>
      m.role === "function"
  );
}

function isPruned(content: unknown): boolean {
  return typeof content === "string" && content.includes("no longer available");
}

// pruneToolResults takes/returns InteractionWithTokens[] (it flattens/re-slices internally). Most
// of these tests don't care about interaction boundaries at all, they exercise the underlying
// flat pruning algorithm, so they wrap a flat message array as a single interaction and
// unwrap the result back to a flat array to assert on.
function asInteractions(
  messages: MessageWithTokens[]
): InteractionWithTokens[] {
  return [{ messages }];
}

function flatMessages(
  interactions: InteractionWithTokens[]
): MessageWithTokens[] {
  return interactions.flatMap((interaction) => interaction.messages);
}

describe("pruneToolResults", () => {
  it("keeps everything untouched when the budget comfortably covers the full history", () => {
    const messages = [1, 2, 3, 4].flatMap((i) => turn(i));
    const wrapped = asInteractions(messages);
    const pruned = pruneToolResults(wrapped, {
      maxTokens: HUGE_BUDGET,
      toolResultsToPreserve: 10,
    });

    expect(pruned).toBe(wrapped); // same reference: nothing needed pruning.
    for (const fn of functionMessagesOf(flatMessages(pruned))) {
      expect(isPruned(fn.content)).toBe(false);
    }
  });

  it("prunes the oldest eligible tool results first, preserving the last toolResultsToPreserve", () => {
    // 6 turns, one tool result each (all big enough that pruning several is required).
    const messages = [1, 2, 3, 4, 5, 6].flatMap((i) => turn(i, 5000));
    // Budget forces pruning of everything except the last 2 tool results.
    const pruned = pruneToolResults(asInteractions(messages), {
      maxTokens: 12_000,
      toolResultsToPreserve: 2,
    });

    const fns = functionMessagesOf(flatMessages(pruned));
    expect(fns.map((f) => isPruned(f.content))).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("makes a single turn's OWN early tool calls eligible for pruning once they exceed the preserved window, since there is no exemption for the current turn", () => {
    // ONE interaction (one continuous turn) making 6 tool calls in a row, e.g. a single agent
    // response that does 6 tool-call steps before its final answer. Preserve only the last 2.
    const oneLongTurn = [1, 2, 3, 4, 5, 6].flatMap((i) => toolStep(i, 5000));
    const pruned = pruneToolResults(asInteractions(oneLongTurn), {
      maxTokens: 12_000,
      toolResultsToPreserve: 2,
    });

    const fns = functionMessagesOf(flatMessages(pruned));
    // Steps 1-4 (this SAME turn's own earlier steps) get pruned. Only the last 2 survive.
    // Nothing here belongs to a "previous" interaction, this proves pruning operates on tool
    // results flatly, not "protect everything in the current turn."
    expect(fns.map((f) => isPruned(f.content))).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
    ]);
  });

  it("calling it twice with a wider floor only ever reaches further, never reconsiders what the first call already pruned", () => {
    // This is the pattern index.ts's escalation uses: call once with the normal floor, then again
    // with a smaller floor (0) and a tighter budget if that wasn't enough. Verifies the two calls
    // don't conflict: the first call's prunings are untouched, and the second call reaches
    // exactly the previously-protected tool results, nothing more, nothing less.
    const messages = [1, 2, 3, 4, 5, 6].flatMap((i) => turn(i, 5000));

    // First call: same as the test above. Prunes turns 1-4, protects the floor of the last 2
    // (turns 5 and 6, each still at their full 5000 tokens).
    const afterFirstCall = pruneToolResults(asInteractions(messages), {
      maxTokens: 12_000,
      toolResultsToPreserve: 2,
    });
    const prunedAfterFirstCall = functionMessagesOf(
      flatMessages(afterFirstCall)
    ).map((f) => isPruned(f.content));
    expect(prunedAfterFirstCall).toEqual([
      true,
      true,
      true,
      true,
      false,
      false,
    ]);

    // Second call: floor widened to 0, budget tightened to 300. Current total (turns 1-4 pruned
    // at 44 tokens each, turns 5-6 still at 5020 each) is 10_216, so both floor turns need
    // pruning too: pruning turn 5 alone only brings it to 5_240, still over 300, so turn 6
    // gets pruned as well, landing at 264.
    const afterSecondCall = pruneToolResults(afterFirstCall, {
      maxTokens: 300,
      toolResultsToPreserve: 0,
    });
    const flatAfterSecondCall = flatMessages(afterSecondCall);

    // Turns 1-4 are untouched by the second call: same pruned placeholders as after the first.
    // The eligibility filter already excludes them (pruning an already-pruned message saves
    // nothing), so the second call never reprocesses them.
    for (let i = 0; i < 4; i++) {
      expect(functionMessagesOf(flatAfterSecondCall)[i].content).toBe(
        functionMessagesOf(flatMessages(afterFirstCall))[i].content
      );
    }
    // Turns 5-6, previously protected by the floor, are now reachable and pruned.
    expect(
      functionMessagesOf(flatAfterSecondCall)
        .slice(4)
        .map((f) => isPruned(f.content))
    ).toEqual([true, true]);

    const totalTokens = flatAfterSecondCall.reduce(
      (sum, m) => sum + m.tokenCount,
      0
    );
    expect(totalTokens).toBeLessThanOrEqual(300);
  });

  it("never touches non-function messages, regardless of budget", () => {
    const messages = [1, 2, 3].flatMap((i) => turn(i, 5000));
    const pruned = flatMessages(
      pruneToolResults(asInteractions(messages), {
        maxTokens: 100,
        toolResultsToPreserve: 0,
      })
    );

    for (const [i, m] of pruned.entries()) {
      if (m.role !== "function") {
        // Pruning only ever replaces function-role messages. Every other message keeps its
        // exact original reference.
        expect(m).toBe(messages[i]);
      }
    }
  });

  it("respects the floor even when the budget cannot be met: never prunes the last toolResultsToPreserve tool results", () => {
    const messages = [1, 2, 3].flatMap((i) => turn(i, 5000));
    // Budget impossibly small: even pruning everything eligible won't fit. The floor (last 2
    // tool results) must still survive untouched, since that's this function's contract. Fitting
    // the impossible case is the caller's job (dropInteractionsToFit or a smaller floor).
    const pruned = pruneToolResults(asInteractions(messages), {
      maxTokens: 1,
      toolResultsToPreserve: 2,
    });

    const fns = functionMessagesOf(flatMessages(pruned));
    expect(fns.map((f) => isPruned(f.content))).toEqual([true, false, false]);
  });

  it("never sweeps a tiny tool result (already smaller than the placeholder) into the checkpoint's forward-rounding, even though doing so would still be within the eligible range", () => {
    // Regression test: the checkpoint-rounding search used to extend the pruning set purely by
    // position, without checking whether pruning each swept-in message actually helps. A tool
    // result smaller than PRUNED_TOOL_RESULT_TOKENS (24) GROWS when "pruned" (replaced by the
    // placeholder), so sweeping one in can push the total over maxTokens, breaking this
    // function's own contract that the result never exceeds maxTokens (short of the floor).
    const messages: MessageWithTokens[] = [
      withTokens(
        {
          role: "user" as const,
          name: "user",
          content: [{ type: "text" as const, text: "u" }],
        },
        500
      ),
      withTokens(
        {
          role: "function" as const,
          name: "big",
          function_call_id: "big_call",
          content: "big_result",
        },
        19000
      ),
      ...["tiny1", "tiny2", "tiny3"].map((name) =>
        withTokens(
          {
            role: "function" as const,
            name,
            function_call_id: `${name}_call`,
            content: "ok",
          },
          1
        )
      ),
      withTokens(
        {
          role: "function" as const,
          name: "floor",
          function_call_id: "floor_call",
          content: "floor_result",
        },
        1000
      ),
    ];

    // Pruning only "big" (19000 -> 24) already brings the 20_503-token total down to 1_527,
    // under this budget, the minimal frontier stops there. Without the fix, the
    // checkpoint-rounding search (finding no bucket boundary between "big" and the floor) used to
    // sweep the three tiny results in too, each GROWING by 23 tokens (1 -> 24), pushing the real
    // total to 1_596, over the 1_530 budget.
    const pruned = flatMessages(
      pruneToolResults(asInteractions(messages), {
        maxTokens: 1530,
        toolResultsToPreserve: 1,
      })
    );
    const totalTokens = pruned.reduce((sum, m) => sum + m.tokenCount, 0);

    expect(totalTokens).toBeLessThanOrEqual(1530);
    const fns = functionMessagesOf(pruned);
    expect(fns.map((f) => isPruned(f.content))).toEqual([
      true, // big: pruned, it's the only one that actually needed to be
      false, // tiny1: left alone, pruning it wouldn't help
      false, // tiny2: left alone
      false, // tiny3: left alone
      false, // floor: protected (toolResultsToPreserve=1)
    ]);
  });

  it("batches pruning via the checkpoint: a small addition doesn't retrigger new pruning, but a large enough one does", () => {
    // Bare tool results, no surrounding user/assistant text, so the prefix sum is exactly
    // (i+1) * 4000, easy to hand-verify against PRUNING_CHECKPOINT_TOKENS (20_000).
    function toolResult(index: number, tokenCount: number): MessageWithTokens {
      return withTokens(
        {
          role: "function" as const,
          name: `tool_${index}`,
          function_call_id: `tool_${index}_call`,
          content: `result_${index}`,
        },
        tokenCount
      );
    }

    const toolResultsToPreserve = 0;
    const maxTokens = 6_000;

    const historyA = [0, 1, 2, 3, 4, 5].map((i) => toolResult(i, 4000));
    const prunedA = flatMessages(
      pruneToolResults(asInteractions(historyA), {
        maxTokens,
        toolResultsToPreserve,
      })
    );
    // Hand-verified: pruning indices 0-4 (saving 3976 tokens each) brings the 24_000-token
    // total down to 4_120, under the 6_000 budget. The checkpoint (20_000) happens to land
    // exactly at index 4's prefix sum (20_000), so no extra over-pruning is needed here.
    const prunedFlagsA = functionMessagesOf(prunedA).map((f) =>
      isPruned(f.content)
    );
    expect(prunedFlagsA).toEqual([true, true, true, true, true, false]);

    // Small addition: one more, much smaller tool result, well under a full checkpoint's
    // worth of new content. The decision for indices 0-5 (present in both histories) must be
    // unchanged: this is the batching guarantee in action.
    const historyB = [...historyA, toolResult(6, 500)];
    const prunedB = flatMessages(
      pruneToolResults(asInteractions(historyB), {
        maxTokens,
        toolResultsToPreserve,
      })
    );
    expect(
      functionMessagesOf(prunedB)
        .slice(0, 6)
        .map((f) => isPruned(f.content))
    ).toEqual(prunedFlagsA);

    // Large addition: a whole new turn-sized tool result. This pushes the running total enough
    // that the previously-kept index 5 must now also be pruned to fit the same budget.
    // Batching means SOME stability, not that the frontier can never move again. Hand-verified:
    // minimally, pruning indices 0-5 (6 items) would bring the 28_000-token total to 4_144,
    // under budget, but the checkpoint search never finds a bucket boundary between index 4
    // (prefix sum 20_000) and index 6 (prefix sum 28_000): all three land in the same
    // floor(x/20_000)=1 bucket. With no checkpoint found in range, the search runs to the end of
    // the eligible set rather than under-shooting the budget, so index 6, the tool result just
    // added in this very call, gets pruned too, not just index 5.
    const historyC = [...historyA, toolResult(6, 4000)];
    const prunedC = flatMessages(
      pruneToolResults(asInteractions(historyC), {
        maxTokens,
        toolResultsToPreserve,
      })
    );
    const prunedFlagsC = functionMessagesOf(prunedC).map((f) =>
      isPruned(f.content)
    );
    expect(prunedFlagsC).toEqual([true, true, true, true, true, true, true]);
  });

  it("is a pure function of history: the same input always yields the same pruning decision", () => {
    const messages = [1, 2, 3, 4, 5].flatMap((i) => turn(i, 3000));
    const first = pruneToolResults(asInteractions(messages), {
      maxTokens: 10_000,
      toolResultsToPreserve: 2,
    });
    const second = pruneToolResults(asInteractions(messages), {
      maxTokens: 10_000,
      toolResultsToPreserve: 2,
    });
    expect(first).toEqual(second);
  });

  it("prunes SOME messages while dropping OTHER whole interactions in a realistic multi-interaction conversation, preserving interaction boundaries throughout", () => {
    // 12 separate interactions (TOOL_RESULTS_TO_PRESERVE-scale), each a real [user, assistant,
    // function] turn, exercises pruneToolResults' interaction-boundary bookkeeping (flatten,
    // prune, re-slice) against real turn structure, not a single synthetic interaction.
    const interactions = groupMessagesIntoInteractions(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].flatMap((i) => turn(i, 5000))
    );
    const pruned = pruneToolResults(interactions, {
      maxTokens: 51_000,
      toolResultsToPreserve: 10,
    });

    // Interaction boundaries survive exactly: still 12 interactions, each still 3 messages.
    expect(pruned).toHaveLength(12);
    for (const interaction of pruned) {
      expect(interaction.messages).toHaveLength(3);
    }

    const fns = functionMessagesOf(flatMessages(pruned));
    expect(fns.map((f) => isPruned(f.content))).toEqual([
      true, // tool_1: outside the floor of 10, pruned
      true, // tool_2: outside the floor of 10, pruned
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false,
      false, // tool_3..tool_12: the protected floor
    ]);
  });
});

describe("dropInteractionsToFit", () => {
  function interactionsFromMessages(messages: MessageWithTokens[]) {
    return groupMessagesIntoInteractions(messages);
  }

  function survivingUserTexts(interactions: InteractionWithTokens[]) {
    return interactions.flatMap((i) =>
      i.messages
        .filter(
          (m): m is Extract<MessageWithTokens, { role: "user" }> =>
            m.role === "user"
        )
        .map((m) =>
          m.content.map((c) => (c.type === "text" ? c.text : "")).join("")
        )
    );
  }

  it("returns the same reference when nothing needs to be dropped", () => {
    const interactions = interactionsFromMessages(
      [1, 2, 3].flatMap((i) => turn(i, 10))
    );
    const result = dropInteractionsToFit(interactions, {
      maxTokens: HUGE_BUDGET,
      interactionsToPreserve: 3,
      batchToCheckpoint: true,
    });
    expect(result).toBe(interactions);
  });

  it("drops whole interactions oldest-first until the budget fits", () => {
    const interactions = interactionsFromMessages(
      [1, 2, 3, 4, 5].flatMap((i) => turn(i, 100))
    );
    // Each interaction costs 120 tokens (10+10+100). Budget only fits 2. Total prefix sums (600
    // max) never cross a 20k checkpoint, so the drop stays exactly minimal.
    const result = dropInteractionsToFit(interactions, {
      maxTokens: 240,
      interactionsToPreserve: 0,
      batchToCheckpoint: true,
    });

    expect(result).toHaveLength(2);
    expect(result.map((i) => getInteractionTokenCount(i))).toEqual([120, 120]);
    // The two that survive are the most recent (i4, i5), oldest dropped first.
    expect(survivingUserTexts(result)).toEqual(["u4", "u5"]);
  });

  it("never drops into the protected floor, even if that means staying over budget", () => {
    const interactions = interactionsFromMessages(
      [1, 2, 3].flatMap((i) => turn(i, 100))
    );
    // Budget is impossibly small, but interactionsToPreserve=3 protects all 3 interactions here.
    const result = dropInteractionsToFit(interactions, {
      maxTokens: 1,
      interactionsToPreserve: 3,
      batchToCheckpoint: true,
    });
    expect(result).toHaveLength(3);
  });

  it("rounds the drop forward to the next checkpoint, buying headroom beyond the minimal fit", () => {
    // 10 interactions of 4000 tokens each (turn = 10 + 10 + 3980), prefix sums 4k, 8k, ..., 40k.
    const interactions = interactionsFromMessages(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((i) => turn(i, 3980))
    );
    // Hand-verified: total 40_000 over a 33_000 budget. Minimal fit drops i1-i2 (remaining
    // 32_000). The first checkpoint at or past that point is i5, whose prefix sum 20_000 crosses
    // the 20k bucket (its predecessor sits at 16_000). The drop extends there: i1-i5 dropped,
    // survivors i6-i10 total 20_000, leaving 13_000 of headroom below the budget instead of
    // 1_000. That headroom is the point: several future turns fit before the head moves again.
    const result = dropInteractionsToFit(interactions, {
      maxTokens: 33_000,
      interactionsToPreserve: 0,
      batchToCheckpoint: true,
    });

    expect(survivingUserTexts(result)).toEqual(["u6", "u7", "u8", "u9", "u10"]);
  });

  it("keeps the same head while growth stays within a checkpoint, then jumps a whole bucket", () => {
    const historyOf = (count: number) =>
      interactionsFromMessages(
        Array.from({ length: count }, (_, i) => i + 1).flatMap((i) =>
          turn(i, 3980)
        )
      );
    const headOf = (interactions: InteractionWithTokens[]) =>
      survivingUserTexts(interactions)[0];

    // Hand-verified at 4000 tokens per interaction and a fixed 33_000 budget. With 10
    // interactions the minimal fit is 2 drops, with 11 it is 3: both round forward to the same
    // checkpoint at prefix sum 20_000, so the head stays at i6 while the conversation grows.
    expect(
      headOf(
        dropInteractionsToFit(historyOf(10), {
          maxTokens: 33_000,
          interactionsToPreserve: 0,
      batchToCheckpoint: true,
        })
      )
    ).toBe("u6");
    expect(
      headOf(
        dropInteractionsToFit(historyOf(11), {
          maxTokens: 33_000,
          interactionsToPreserve: 0,
      batchToCheckpoint: true,
        })
      )
    ).toBe("u6");

    // At 15 interactions (60_000 total) the minimal fit passes the 20k checkpoint, so the head
    // jumps a whole bucket to the next crossing: i10's prefix sum 40_000 crosses the 40k bucket,
    // putting the head at i11. One batched move instead of five single-interaction slides.
    expect(
      headOf(
        dropInteractionsToFit(historyOf(15), {
          maxTokens: 33_000,
          interactionsToPreserve: 0,
      batchToCheckpoint: true,
        })
      )
    ).toBe("u11");
  });

  it("falls back to the minimal drop when no checkpoint exists in the droppable range", () => {
    // 8 interactions of 2000 tokens each: every prefix sum stays under 20k, so there is no
    // checkpoint anywhere. Rounding forward here would mean dropping all the way to the floor,
    // erasing content for no stability gain, so the drop must stay exactly minimal.
    const interactions = interactionsFromMessages(
      [1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => turn(i, 1980))
    );
    // Hand-verified: total 16_000 over a 13_000 budget, dropping i1-i2 lands at 12_000.
    const result = dropInteractionsToFit(interactions, {
      maxTokens: 13_000,
      interactionsToPreserve: 3,
      batchToCheckpoint: true,
    });

    expect(survivingUserTexts(result)).toEqual([
      "u3",
      "u4",
      "u5",
      "u6",
      "u7",
      "u8",
    ]);
  });

  it("lands the very first drop on a real checkpoint instead of paying a minimal drop and re-dropping next call", () => {
    // 10 interactions of 4000 tokens. Hand-verified: total 40_000 over a 39_000 budget, the
    // minimal fit drops only i1 (remaining 36_000). Treating index 0's predecessor as prefix sum
    // 0, no crossing exists until i5 (prefix sum 20_000 vs 16_000), so the first-ever drop
    // already extends there. Same head as a much tighter budget would produce (see the test
    // above): drop onset lands directly on the stable geometry, one full cache miss, not two.
    const interactions = interactionsFromMessages(
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].flatMap((i) => turn(i, 3980))
    );
    const result = dropInteractionsToFit(interactions, {
      maxTokens: 39_000,
      interactionsToPreserve: 0,
      batchToCheckpoint: true,
    });

    expect(survivingUserTexts(result)).toEqual(["u6", "u7", "u8", "u9", "u10"]);
  });

  it("drops exactly the minimum when batchToCheckpoint is false, never rounding into recent interactions", () => {
    // The last-resort path (index.ts layer 4) uses this mode: the head moves on this call no
    // matter what, so rounding forward would erase recent interactions for zero cache benefit.
    // Hand-verified: sizes 5000/14000/10000, budget 12_000. Minimal drops i1-i2 (remaining
    // 10_000). Batched would extend to the crossing at i3 (prefix sum 29_000 vs 19_000) and
    // return nothing at all.
    const interactions = interactionsFromMessages(
      [
        turn(1, 4980),
        turn(2, 13_980),
        turn(3, 9980),
      ].flat()
    );

    const minimal = dropInteractionsToFit(interactions, {
      maxTokens: 12_000,
      interactionsToPreserve: 0,
      batchToCheckpoint: false,
    });
    expect(survivingUserTexts(minimal)).toEqual(["u3"]);

    const batched = dropInteractionsToFit(interactions, {
      maxTokens: 12_000,
      interactionsToPreserve: 0,
      batchToCheckpoint: true,
    });
    expect(batched).toHaveLength(0);
  });
});
