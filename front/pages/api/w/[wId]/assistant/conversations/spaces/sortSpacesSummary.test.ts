import { describe, expect, it } from "vitest";
import { sortSpacesSummary } from "./index";

// "mentions" = unreadConversations.length > 0: conversations the user participates in
// that have new messages since they last read them. These show a numeric badge in the sidebar.
// "last user activity" = the most recent time the user read any conversation in the space.

type FakeSpace = { id: number; name: string };

function makeConversationsBySpace(
  entries: Array<{ id: number; mentionCount: number }>
): Map<number, { unreadConversations: unknown[] }> {
  return new Map(
    entries.map(({ id, mentionCount }) => [
      id,
      { unreadConversations: Array(mentionCount).fill(null) },
    ])
  );
}

describe("sortSpacesSummary", () => {
  it("puts spaces with pending mentions (numeric badge) before spaces without", () => {
    const spaces: FakeSpace[] = [
      { id: 1, name: "no-mentions" },
      { id: 2, name: "has-mentions" },
    ];
    const conversationsBySpace = makeConversationsBySpace([
      { id: 1, mentionCount: 0 },
      { id: 2, mentionCount: 3 },
    ]);

    const sorted = sortSpacesSummary(spaces, conversationsBySpace, new Map());

    expect(sorted.map((s) => s.id)).toEqual([2, 1]);
  });

  it("among spaces with no mentions, sorts by last time the user read something, most recent first", () => {
    const spaces: FakeSpace[] = [
      { id: 1, name: "read-a-while-ago" },
      { id: 2, name: "read-recently" },
      { id: 3, name: "never-read" },
    ];
    const conversationsBySpace = makeConversationsBySpace([]);
    const lastUserActivityBySpace = new Map<number, Date>([
      [1, new Date("2024-01-01")],
      [2, new Date("2024-06-01")],
      // id 3: user has never read anything in this space
    ]);

    const sorted = sortSpacesSummary(
      spaces,
      conversationsBySpace,
      lastUserActivityBySpace
    );

    expect(sorted.map((s) => s.id)).toEqual([2, 1, 3]);
  });

  it("among spaces that all have mentions, sorts by last user activity, most recent first", () => {
    const spaces: FakeSpace[] = [
      { id: 1, name: "mentions-read-a-while-ago" },
      { id: 2, name: "mentions-read-recently" },
    ];
    const conversationsBySpace = makeConversationsBySpace([
      { id: 1, mentionCount: 1 },
      { id: 2, mentionCount: 2 },
    ]);
    const lastUserActivityBySpace = new Map<number, Date>([
      [1, new Date("2024-01-01")],
      [2, new Date("2024-06-01")],
    ]);

    const sorted = sortSpacesSummary(
      spaces,
      conversationsBySpace,
      lastUserActivityBySpace
    );

    expect(sorted.map((s) => s.id)).toEqual([2, 1]);
  });

  it("a space with mentions ranks above a more recently active space with no mentions", () => {
    const spaces: FakeSpace[] = [
      { id: 1, name: "very-recently-active-but-no-mentions" },
      { id: 2, name: "has-mentions-but-less-recent-activity" },
    ];
    const conversationsBySpace = makeConversationsBySpace([
      { id: 1, mentionCount: 0 },
      { id: 2, mentionCount: 1 },
    ]);
    const lastUserActivityBySpace = new Map<number, Date>([
      [1, new Date("2024-12-31")],
      [2, new Date("2024-01-01")],
    ]);

    const sorted = sortSpacesSummary(
      spaces,
      conversationsBySpace,
      lastUserActivityBySpace
    );

    expect(sorted.map((s) => s.id)).toEqual([2, 1]);
  });

  it("a recently active space with no mentions ranks above a bold-only unread space (non-participant unread does not affect sort order)", () => {
    const spaces: FakeSpace[] = [
      { id: 1, name: "bold-unread-but-less-recent-activity" },
      { id: 2, name: "no-mentions-but-recently-active" },
    ];
    // Both spaces have unreadConversations.length === 0 (no numeric badge / no mentions).
    // Space 1 has nonParticipantUnreadConversations (shown bold), but that does not influence sort order.
    const conversationsBySpace = new Map<
      number,
      { unreadConversations: unknown[] }
    >([
      [1, { unreadConversations: [] }],
      [2, { unreadConversations: [] }],
    ]);
    const lastUserActivityBySpace = new Map<number, Date>([
      [1, new Date("2024-01-01")],
      [2, new Date("2024-06-01")],
    ]);

    const sorted = sortSpacesSummary(
      spaces,
      conversationsBySpace,
      lastUserActivityBySpace
    );

    expect(sorted.map((s) => s.id)).toEqual([2, 1]);
  });

  it("does not mutate the input array", () => {
    const spaces: FakeSpace[] = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ];
    const original = [...spaces];
    sortSpacesSummary(spaces, makeConversationsBySpace([]), new Map());
    expect(spaces).toEqual(original);
  });
});
