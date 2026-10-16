import {
  getChannelThreadLocation,
  getRootMessageIdFromConversationId,
  selectThreadHistoryMessages,
  sortMessagesByCreatedDateTimeDesc,
} from "@connectors/api/webhooks/teams/thread_history";
import type { ChatMessage } from "@microsoft/microsoft-graph-types";
import { describe, expect, it } from "vitest";

function userMessage(
  id: string,
  createdDateTime: string,
  content = `content of ${id}`
): ChatMessage {
  return {
    id,
    createdDateTime,
    from: { user: { displayName: `user-${id}` } },
    body: { content },
  };
}

function botMessage(id: string, createdDateTime: string): ChatMessage {
  return {
    id,
    createdDateTime,
    from: { application: { displayName: "Dust" } },
    body: { content: "bot reply" },
  };
}

describe("getRootMessageIdFromConversationId", () => {
  it("extracts the root message id from a channel thread conversation id", () => {
    expect(
      getRootMessageIdFromConversationId(
        "19:abc123@thread.tacv2;messageid=1690271996123"
      )
    ).toBe("1690271996123");
  });

  it("is case-insensitive on the messageid key", () => {
    expect(
      getRootMessageIdFromConversationId(
        "19:abc123@thread.tacv2;messageId=1690271996123"
      )
    ).toBe("1690271996123");
  });

  it("returns undefined for channel root posts and group chats", () => {
    expect(
      getRootMessageIdFromConversationId("19:abc123@thread.tacv2")
    ).toBeUndefined();
    expect(
      getRootMessageIdFromConversationId("19:xyz@thread.v2")
    ).toBeUndefined();
  });
});

describe("getChannelThreadLocation", () => {
  it("reads the flat teamsTeamId/teamsChannelId shape", () => {
    expect(
      getChannelThreadLocation({
        teamsTeamId: "team-1",
        teamsChannelId: "19:channel@thread.tacv2",
      })
    ).toEqual({ teamId: "team-1", channelId: "19:channel@thread.tacv2" });
  });

  it("falls back to the nested team/channel shape", () => {
    expect(
      getChannelThreadLocation({
        team: { id: "team-2" },
        channel: { id: "19:other@thread.tacv2" },
      })
    ).toEqual({ teamId: "team-2", channelId: "19:other@thread.tacv2" });
  });

  it("returns undefined fields for missing or malformed channelData", () => {
    expect(getChannelThreadLocation(undefined)).toEqual({});
    expect(getChannelThreadLocation(null)).toEqual({});
    expect(getChannelThreadLocation("19:abc@thread.tacv2")).toEqual({});
    expect(getChannelThreadLocation({})).toEqual({
      teamId: undefined,
      channelId: undefined,
    });
  });
});

describe("sortMessagesByCreatedDateTimeDesc", () => {
  it("orders messages newest-first without mutating the input", () => {
    const older = userMessage("1", "2026-06-17T09:00:00Z");
    const newer = userMessage("2", "2026-06-17T10:00:00Z");
    const input = [older, newer];
    const sorted = sortMessagesByCreatedDateTimeDesc(input);
    expect(sorted.map((m) => m.id)).toEqual(["2", "1"]);
    expect(input.map((m) => m.id)).toEqual(["1", "2"]);
  });

  it("places messages without a timestamp last", () => {
    const dated = userMessage("1", "2026-06-17T09:00:00Z");
    const undated: ChatMessage = { id: "2", from: { user: {} } };
    const sorted = sortMessagesByCreatedDateTimeDesc([undated, dated]);
    expect(sorted.map((m) => m.id)).toEqual(["1", "2"]);
  });
});

describe("selectThreadHistoryMessages", () => {
  // Newest-first: current mention, then replies, then the thread root.
  const root = userMessage("root", "2026-06-17T09:00:00Z");
  const reply1 = userMessage("reply1", "2026-06-17T09:05:00Z");
  const reply2 = userMessage("reply2", "2026-06-17T09:10:00Z");
  const current = userMessage("current", "2026-06-17T09:15:00Z");
  const thread = [current, reply2, reply1, root];

  it("includes the thread root message on a first mention in a thread", () => {
    const result = selectThreadHistoryMessages({
      messages: thread,
      currentMessageId: "current",
      rootMessageId: "root",
    });
    expect(result.map((m) => m.id)).toEqual(["reply2", "reply1", "root"]);
  });

  it("keeps fetched messages when the root message is missing from the page", () => {
    // Regression: the previous logic turned "root not found" (findIndex -1)
    // into endIndex 0, silently dropping the whole history.
    const result = selectThreadHistoryMessages({
      messages: thread.slice(0, 3),
      currentMessageId: "current",
      rootMessageId: "root",
    });
    expect(result.map((m) => m.id)).toEqual(["reply2", "reply1"]);
  });

  it("attaches no history on a first mention without a thread anchor (existing chat behavior)", () => {
    // Group chats and channel root posts have no root message id: with no
    // previous bot reply either, no history is attached.
    const result = selectThreadHistoryMessages({
      messages: thread.slice(0, 3),
      currentMessageId: "current",
    });
    expect(result).toEqual([]);
  });

  it("still uses the last bot reply as cutoff in chats without a root message id", () => {
    const bot = botMessage("bot1", "2026-06-17T09:07:00Z");
    const result = selectThreadHistoryMessages({
      messages: [current, reply2, bot, reply1],
      currentMessageId: "current",
      lastBotMessageId: "bot1",
    });
    expect(result.map((m) => m.id)).toEqual(["reply2"]);
  });

  it("stops before the last bot reply when there is one", () => {
    const bot = botMessage("bot1", "2026-06-17T09:07:00Z");
    const withBot = [current, reply2, bot, reply1, root];
    const result = selectThreadHistoryMessages({
      messages: withBot,
      currentMessageId: "current",
      lastBotMessageId: "bot1",
      rootMessageId: "root",
    });
    expect(result.map((m) => m.id)).toEqual(["reply2"]);
  });

  it("keeps everything older than the current message when the last bot reply scrolled out of the page", () => {
    const result = selectThreadHistoryMessages({
      messages: thread,
      currentMessageId: "current",
      lastBotMessageId: "bot-not-in-page",
      rootMessageId: "root",
    });
    expect(result.map((m) => m.id)).toEqual(["reply2", "reply1", "root"]);
  });

  it("drops non-user messages from the history", () => {
    const bot = botMessage("bot-system", "2026-06-17T09:06:00Z");
    const result = selectThreadHistoryMessages({
      messages: [current, reply2, bot, reply1, root],
      currentMessageId: "current",
      rootMessageId: "root",
    });
    expect(result.map((m) => m.id)).toEqual(["reply2", "reply1", "root"]);
  });

  it("returns an empty history when the current message is the only one", () => {
    const result = selectThreadHistoryMessages({
      messages: [current],
      currentMessageId: "current",
      rootMessageId: "current",
    });
    expect(result).toEqual([]);
  });

  it("includes the current message when it is absent from the page", () => {
    // Graph eventual consistency: if the current message is not returned yet,
    // fall back to the whole page rather than dropping it.
    const result = selectThreadHistoryMessages({
      messages: thread.slice(1),
      currentMessageId: "current",
      rootMessageId: "root",
    });
    expect(result.map((m) => m.id)).toEqual(["reply2", "reply1", "root"]);
  });
});
