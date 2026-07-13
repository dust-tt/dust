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
    const floorCount = 4;
    const batch = TOOL_OUTPUT_FETCH_BATCH_SIZE;

    // ids strictly after `excludedUpTo` (i.e. from excludedUpTo+1 to n).
    const idsIncludedFrom = (excludedUpTo: number, n: number) =>
      new Set(
        Array.from({ length: n - excludedUpTo }, (_, i) => excludedUpTo + i + 1)
      );

    // First n where floorStart (n - floorCount) reaches the first batch boundary: ids 1..batch
    // get excluded.
    const nAtFirstCrossing = batch + floorCount;
    expect(
      computeMessagesWithToolOutputContent(
        buildInteractions(nAtFirstCrossing),
        floorCount
      )
    ).toEqual(idsIncludedFrom(batch, nAtFirstCrossing));

    // Just before the second boundary: unchanged from above, the checkpoint hasn't moved yet.
    const nJustBeforeNextCrossing = 2 * batch + floorCount - 1;
    expect(
      computeMessagesWithToolOutputContent(
        buildInteractions(nJustBeforeNextCrossing),
        floorCount
      )
    ).toEqual(idsIncludedFrom(batch, nJustBeforeNextCrossing));

    // One more turn crosses the next boundary: ids batch+1..2*batch also get excluded, in one
    // jump.
    const nAtNextCrossing = 2 * batch + floorCount;
    expect(
      computeMessagesWithToolOutputContent(
        buildInteractions(nAtNextCrossing),
        floorCount
      )
    ).toEqual(idsIncludedFrom(2 * batch, nAtNextCrossing));
  });

  it("never re-includes an interaction once it stops being fetched, as the conversation grows", () => {
    // Interactions are EXPECTED to eventually stop being fetched as the conversation grows past a
    // batch boundary, that's the whole point. What must never happen is the opposite: something
    // that's already excluded coming back once more interactions arrive.
    let previouslyExcluded = new Set<number>();
    // Comfortably past two batch boundary crossings, whatever the batch size is.
    const upperBound = 2 * TOOL_OUTPUT_FETCH_BATCH_SIZE + 20;

    for (let n = 1; n <= upperBound; n++) {
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
