import {
  getBranchedInsertIndex,
  upsertMessageInList,
} from "@app/components/assistant/conversation/ConversationViewer";
import type {
  AgentMessageWithStreaming,
  VirtuosoMessage,
} from "@app/components/assistant/conversation/types";
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

describe("upsertMessageInList", () => {
  const makeAgentMessage = ({
    rank,
    branchId = null,
    sId,
    agentState = "thinking",
    content = null,
  }: {
    rank: number;
    branchId?: string | null;
    sId: string;
    agentState?: AgentMessageWithStreaming["streaming"]["agentState"];
    content?: string | null;
  }): AgentMessageWithStreaming =>
    ({
      sId,
      rank,
      branchId,
      type: "agent_message",
      status: "created",
      content,
      chainOfThought: null,
      streaming: {
        agentState,
        isRetrying: false,
        lastUpdated: new Date(),
        actionProgress: new Map(),
        pendingToolCalls: [],
        inlineActivitySteps: [],
      },
    }) as unknown as AgentMessageWithStreaming;

  const makeFakeListData = (initial: VirtuosoMessage[]) => {
    let items = [...initial];
    const data = {
      get: () => items,
      find: (predicate: (m: VirtuosoMessage) => boolean) =>
        items.find(predicate),
      map: (fn: (m: VirtuosoMessage) => VirtuosoMessage) => {
        items = items.map(fn);
      },
      insert: (msgs: VirtuosoMessage[], index: number) => {
        items = [...items.slice(0, index), ...msgs, ...items.slice(index)];
      },
      append: (msgs: VirtuosoMessage[]) => {
        items = [...items, ...msgs];
      },
    };
    return data as unknown as Parameters<typeof upsertMessageInList>[0];
  };

  it("replaces the optimistic placeholder at the same rank/branch", () => {
    const placeholder = makeAgentMessage({
      rank: 2,
      sId: "placeholder-agent-message-123",
      agentState: "placeholder",
    });
    const data = makeFakeListData([placeholder]);

    const real = makeAgentMessage({ rank: 2, sId: "real-sid" });
    upsertMessageInList(data, real);

    const items = data.get();
    expect(items).toHaveLength(1);
    expect(items[0].sId).toBe("real-sid");
    expect((items[0] as AgentMessageWithStreaming).streaming.agentState).toBe(
      "thinking"
    );
  });

  it("does not overwrite a message that already progressed past its initial state", () => {
    const progressed = makeAgentMessage({
      rank: 2,
      sId: "real-sid",
      agentState: "writing",
      content: "already streamed content",
    });
    const data = makeFakeListData([progressed]);

    // Replay of agent_message_new with the original "created" payload.
    const replay = makeAgentMessage({ rank: 2, sId: "real-sid" });
    upsertMessageInList(data, replay);

    const items = data.get();
    expect(items).toHaveLength(1);
    expect((items[0] as AgentMessageWithStreaming).content).toBe(
      "already streamed content"
    );
  });

  it("replaces the same message when it is still at its initial state", () => {
    const initial = makeAgentMessage({ rank: 2, sId: "real-sid" });
    const data = makeFakeListData([initial]);

    const replay = makeAgentMessage({ rank: 2, sId: "real-sid" });
    upsertMessageInList(data, replay);

    const items = data.get();
    expect(items).toHaveLength(1);
    expect(items[0]).toBe(replay);
  });

  it("inserts the message when no entry matches its rank/branch", () => {
    const existing = makeAgentMessage({ rank: 1, sId: "old-sid" });
    const data = makeFakeListData([existing]);

    const real = makeAgentMessage({ rank: 3, sId: "real-sid" });
    upsertMessageInList(data, real);

    const items = data.get();
    expect(items.map((m) => m.sId)).toEqual(["old-sid", "real-sid"]);
  });

  it("retry with a new sId at the same rank/branch replaces the previous message", () => {
    const previous = makeAgentMessage({
      rank: 2,
      sId: "v1-sid",
      agentState: "writing",
      content: "v1 content",
    });
    const data = makeFakeListData([previous]);

    const retry = makeAgentMessage({ rank: 2, sId: "v2-sid" });
    upsertMessageInList(data, retry);

    const items = data.get();
    expect(items).toHaveLength(1);
    expect(items[0].sId).toBe("v2-sid");
  });

  it("inserts a user message in its branch when no entry matches (branch reconciliation)", () => {
    const makeUserMessage = (
      rank: number,
      branchId: string | null,
      sId: string
    ): VirtuosoMessage =>
      ({
        sId,
        rank,
        branchId,
        type: "user_message",
        contentFragments: [],
        context: { origin: "web" },
      }) as unknown as VirtuosoMessage;

    const mainThread = [
      makeUserMessage(0, null, "user-0"),
      makeAgentMessage({ rank: 1, sId: "agent-1" }),
    ];
    const data = makeFakeListData(mainThread);

    const branchUserMessage = makeUserMessage(2, "branch-a", "branch-user");
    upsertMessageInList(data, branchUserMessage);

    expect(data.get().map((m) => m.sId)).toEqual([
      "user-0",
      "agent-1",
      "branch-user",
    ]);

    // A second upsert (e.g. the SSE arriving after the POST response) is
    // idempotent: it replaces the entry instead of duplicating it.
    upsertMessageInList(data, branchUserMessage);
    expect(data.get()).toHaveLength(3);
  });
});
