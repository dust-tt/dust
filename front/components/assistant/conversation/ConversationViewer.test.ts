import { getBranchedInsertIndex } from "@app/components/assistant/conversation/ConversationViewer";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { describe, expect, it } from "vitest";

describe("getBranchedInsertIndex", () => {
  const makeMessage = (
    rank: number,
    branchId: string | null
  ): VirtuosoMessage =>
    ({
      rank,
      branchId,
      created: new Date().toISOString(),
      type: "user_message",
      contentFragments: { contentNodes: [], uploaded: [] },
      context: { origin: "user" },
    }) as unknown as VirtuosoMessage;

  it("falls back to rank-based insertion when no blocking branches", () => {
    const data: VirtuosoMessage[] = [
      makeMessage(1, null),
      makeMessage(3, null),
      makeMessage(5, null),
    ];

    const newMessage = makeMessage(2, "branch-b");

    // Should insert before first rank > 2 (i.e. before rank 3, index 1).
    const index = getBranchedInsertIndex(data, newMessage);
    expect(index).toBe(1);
  });

  it("inserts after a single blocking branch block that shares the same rank", () => {
    const data: VirtuosoMessage[] = [
      // Branch A block
      makeMessage(1, "branch-a"),
      makeMessage(2, "branch-a"),
      // Other stuff
      makeMessage(3, null),
    ];

    const newMessage = makeMessage(1, "branch-b");

    // Branch A has rank 1, so new message should be inserted after
    // all messages from branch A (index 2).
    const index = getBranchedInsertIndex(data, newMessage);
    expect(index).toBe(2);
  });

  it("inserts after all messages from multiple blocking branches that share the same rank", () => {
    const data: VirtuosoMessage[] = [
      // Branch A block
      makeMessage(1, "branch-a"),
      makeMessage(2, "branch-a"),
      // Branch B block
      makeMessage(1, "branch-b"),
      makeMessage(2, "branch-b"),
      // Some later messages from A and B interleaved
      makeMessage(3, "branch-a"),
      makeMessage(4, "branch-b"),
      // Unrelated branch C with different ranks
      makeMessage(10, "branch-c"),
    ];

    const newMessage = makeMessage(1, "branch-d");

    // Branches A and B both have rank 1, so they are blocking.
    // The last message from either branch A or B is at index 5 (rank 4, branch-b),
    // so the new message should be inserted at index 6.
    const index = getBranchedInsertIndex(data, newMessage);
    expect(index).toBe(6);
  });

  it("keeps messages within the new branch ordered by rank", () => {
    const data: VirtuosoMessage[] = [
      // Branch A block
      makeMessage(1, "branch-a"),
      makeMessage(2, "branch-a"),
    ];

    // First message in branch B
    const first = makeMessage(1, "branch-b");
    let index = getBranchedInsertIndex(data, first);
    expect(index).toBe(2);
    const withFirst = [...data.slice(0, index), first, ...data.slice(index)];

    // Second message in branch B with higher rank should come after the first
    const second = makeMessage(2, "branch-b");
    index = getBranchedInsertIndex(withFirst, second);
    expect(index).toBe(3);
  });

  it("handles out-of-order arrivals for a new branch after an existing branch", () => {
    // Existing branch A
    const base: VirtuosoMessage[] = [
      makeMessage(1, "branch-a"),
      makeMessage(2, "branch-a"),
    ];

    // Out-of-order arrival: B2 then B1
    const b2 = makeMessage(2, "branch-b");
    let index = getBranchedInsertIndex(base, b2);
    // B2 sees branch A as blocking, so goes after A2
    expect(index).toBe(2);
    const afterB2 = [...base.slice(0, index), b2, ...base.slice(index)];

    const b1 = makeMessage(1, "branch-b");
    index = getBranchedInsertIndex(afterB2, b1);
    // B1 should insert before B2 but still after branch A
    expect(index).toBe(2);
    const finalData = [...afterB2.slice(0, index), b1, ...afterB2.slice(index)];

    expect(finalData.map((m) => [m.branchId, m.rank])).toEqual([
      ["branch-a", 1],
      ["branch-a", 2],
      ["branch-b", 1],
      ["branch-b", 2],
    ]);
  });

  it("handles multiple existing branches and out-of-order arrivals for a new branch", () => {
    const base: VirtuosoMessage[] = [
      // Branch A block
      makeMessage(1, "branch-a"),
      makeMessage(2, "branch-a"),
      // Some unrelated messages
      makeMessage(3, null),
      // Branch B block
      makeMessage(1, "branch-b"),
      makeMessage(2, "branch-b"),
    ];

    // New branch C arrives out of order: C2 then C1
    const c2 = makeMessage(2, "branch-c");
    let index = getBranchedInsertIndex(base, c2);
    // Branches A and B both block (they have rank 2), so C2 goes after last of A/B
    expect(index).toBe(5);
    const afterC2 = [...base.slice(0, index), c2, ...base.slice(index)];

    const c1 = makeMessage(1, "branch-c");
    index = getBranchedInsertIndex(afterC2, c1);
    // C1 should end up before C2 but still after all A/B messages
    expect(index).toBe(5);
    const finalData = [...afterC2.slice(0, index), c1, ...afterC2.slice(index)];

    expect(finalData.map((m) => [m.branchId, m.rank])).toEqual([
      ["branch-a", 1],
      ["branch-a", 2],
      [null, 3],
      ["branch-b", 1],
      ["branch-b", 2],
      ["branch-c", 1],
      ["branch-c", 2],
    ]);
  });

  it("does not treat null-branch messages as blockers", () => {
    const data: VirtuosoMessage[] = [
      makeMessage(1, null),
      makeMessage(2, null),
      makeMessage(3, null),
    ];

    const newMessage = makeMessage(2, "branch-x");
    const index = getBranchedInsertIndex(data, newMessage);
    // Pure rank-based behavior: before first rank > 2 (i.e. before rank 3)
    expect(index).toBe(2);
  });
});
