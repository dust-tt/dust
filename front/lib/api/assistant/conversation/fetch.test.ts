import {
  computeMessagesWithToolOutputContent,
  TOOL_OUTPUT_FETCH_BATCH_SIZE,
} from "@app/lib/api/assistant/conversation/fetch";
import type { Interaction } from "@app/lib/api/assistant/conversation_rendering/pruning";
import { describe, expect, it } from "vitest";

// Builds n interactions, each a user message followed by an agent message. Agent message ids are
// 1, 2, 3, ... in order, matching the interaction's position, so tests can assert on exactly which
// interactions' content ended up included.
function buildInteractions(
  n: number
): Interaction<{ id: number; role: "user" | "agent" }>[] {
  return Array.from({ length: n }, (_, i) => ({
    messages: [
      { id: 1000 + i, role: "user" as const },
      { id: i + 1, role: "agent" as const },
    ],
  }));
}

describe("computeMessagesWithToolOutputContent", () => {
  it("includes every interaction when there are fewer than the floor", () => {
    const result = computeMessagesWithToolOutputContent(
      buildInteractions(3),
      4
    );

    expect(result).toEqual(new Set([1, 2, 3]));
  });

  it("returns nothing when floorCount is 0 or negative", () => {
    expect(
      computeMessagesWithToolOutputContent(buildInteractions(10), 0)
    ).toEqual(new Set());
    expect(
      computeMessagesWithToolOutputContent(buildInteractions(10), -1)
    ).toEqual(new Set());
  });

  it("includes everything while the floor's start hasn't crossed the first batch boundary", () => {
    // floorCount 4, batch size 10: floorStart only reaches 10 once there are 14 interactions, so
    // anything below that still includes the full history.
    const n = TOOL_OUTPUT_FETCH_BATCH_SIZE + 4 - 1; // 13
    const result = computeMessagesWithToolOutputContent(
      buildInteractions(n),
      4
    );

    expect(result).toEqual(new Set(Array.from({ length: n }, (_, i) => i + 1)));
  });

  it("excludes the oldest batch once the floor's start crosses a batch boundary, and stays put across many turns", () => {
    // At n=14, floorStart=10, which is the first batch boundary: interactions 1-10 (ids) get
    // excluded, 11-14 stay included.
    const atFirstCrossing = computeMessagesWithToolOutputContent(
      buildInteractions(14),
      4
    );
    expect(atFirstCrossing).toEqual(new Set([11, 12, 13, 14]));

    // Ten turns later (n=23, floorStart=19), the boundary hasn't moved yet: still exactly
    // interactions 1-10 excluded, everything from 11 onward included.
    const tenTurnsLater = computeMessagesWithToolOutputContent(
      buildInteractions(23),
      4
    );
    expect(tenTurnsLater).toEqual(
      new Set(Array.from({ length: 13 }, (_, i) => i + 11))
    );

    // One more turn (n=24, floorStart=20) crosses the next batch boundary: interactions 11-20 now
    // also get excluded, in one jump.
    const nextCrossing = computeMessagesWithToolOutputContent(
      buildInteractions(24),
      4
    );
    expect(nextCrossing).toEqual(new Set([21, 22, 23, 24]));
  });

  it("never re-includes an interaction once it stops being fetched, as the conversation grows", () => {
    // Interactions are EXPECTED to eventually stop being fetched as the conversation grows past a
    // batch boundary, that's the whole point. What must never happen is the opposite: something
    // that's already excluded coming back once more interactions arrive.
    let previouslyExcluded = new Set<number>();

    for (let n = 1; n <= 50; n++) {
      const included = computeMessagesWithToolOutputContent(
        buildInteractions(n),
        4
      );
      const excludedNow = new Set(
        Array.from({ length: n }, (_, i) => i + 1).filter(
          (id) => !included.has(id)
        )
      );

      for (const id of previouslyExcluded) {
        expect(excludedNow.has(id)).toBe(true);
      }
      previouslyExcluded = excludedNow;
    }
  });
});
