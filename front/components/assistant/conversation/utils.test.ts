import {
  getGroupConversationsByDate,
  getGroupConversationsByUnreadAndActionRequired,
} from "@app/components/assistant/conversation/utils";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeConversation(
  overrides: Partial<ConversationListItemType> & { sId: string }
): ConversationListItemType {
  return {
    actionRequired: false,
    isParticipant: false,
    created: 1,
    hasError: false,
    isRunningAgentLoop: false,
    lastReadMs: null,
    metadata: {},
    nextWakeupAt: null,
    requestedSpaceIds: [],
    spaceId: null,
    title: overrides.sId,
    triggerId: null,
    unread: false,
    updated: 1,
    ...overrides,
  };
}

describe("getGroupConversationsByUnreadAndActionRequired", () => {
  it("buckets unread conversations into the inbox", () => {
    const { inboxConversations, readConversations } =
      getGroupConversationsByUnreadAndActionRequired(
        [
          makeConversation({ sId: "unread", unread: true }),
          makeConversation({ sId: "read" }),
        ],
        "",
        null
      );

    expect(inboxConversations.map((c) => c.sId)).toEqual(["unread"]);
    expect(readConversations.map((c) => c.sId)).toEqual(["read"]);
  });

  it("keeps the actively viewed unread conversation out of the inbox", () => {
    const { inboxConversations, readConversations } =
      getGroupConversationsByUnreadAndActionRequired(
        [
          makeConversation({ sId: "active", unread: true }),
          makeConversation({ sId: "other", unread: true }),
        ],
        "",
        "active"
      );

    expect(inboxConversations.map((c) => c.sId)).toEqual(["other"]);
    expect(readConversations.map((c) => c.sId)).toEqual(["active"]);
  });

  it("keeps the actively viewed conversation in the inbox when an action is required", () => {
    const { inboxConversations } =
      getGroupConversationsByUnreadAndActionRequired(
        [makeConversation({ sId: "active", actionRequired: true })],
        "",
        "active"
      );

    expect(inboxConversations.map((c) => c.sId)).toEqual(["active"]);
  });

  it("keeps triggered conversations in their own bucket, active or not", () => {
    const { triggeredConversations, inboxConversations } =
      getGroupConversationsByUnreadAndActionRequired(
        [makeConversation({ sId: "active", unread: true, triggerId: "trig" })],
        "",
        "active"
      );

    expect(triggeredConversations.map((c) => c.sId)).toEqual(["active"]);
    expect(inboxConversations).toEqual([]);
  });
});

describe("getGroupConversationsByDate", () => {
  const NOW = new Date(2026, 8, 10, 15, 0, 0);

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("buckets conversations by their updated (or created) date", () => {
    const todayMs = new Date(2026, 8, 10, 9, 0, 0).getTime();
    const yesterdayMs = new Date(2026, 8, 9, 9, 0, 0).getTime();
    const lastWeekMs = new Date(2026, 8, 6, 9, 0, 0).getTime();
    const lastMonthMs = new Date(2026, 7, 20, 9, 0, 0).getTime();
    const lastYearMs = new Date(2026, 2, 10, 9, 0, 0).getTime();
    const olderMs = new Date(2024, 8, 10, 9, 0, 0).getTime();

    const groups = getGroupConversationsByDate({
      conversations: [
        makeConversation({ sId: "today", updated: todayMs }),
        makeConversation({ sId: "yesterday", updated: yesterdayMs }),
        makeConversation({ sId: "lastWeek", updated: lastWeekMs }),
        makeConversation({ sId: "lastMonth", updated: lastMonthMs }),
        makeConversation({ sId: "lastYear", updated: lastYearMs }),
        makeConversation({ sId: "older", updated: olderMs }),
      ],
      titleFilter: "",
    });

    expect(groups["Today"].map((c) => c.sId)).toEqual(["today"]);
    expect(groups["Yesterday"].map((c) => c.sId)).toEqual(["yesterday"]);
    expect(groups["Last Week"].map((c) => c.sId)).toEqual(["lastWeek"]);
    expect(groups["Last Month"].map((c) => c.sId)).toEqual(["lastMonth"]);
    expect(groups["Last 12 Months"].map((c) => c.sId)).toEqual(["lastYear"]);
    expect(groups["Older"].map((c) => c.sId)).toEqual(["older"]);
  });

  it("filters out conversations not matching the title filter", () => {
    const groups = getGroupConversationsByDate({
      conversations: [
        makeConversation({ sId: "match", title: "Foo" }),
        makeConversation({ sId: "no-match", title: "Bar" }),
      ],
      titleFilter: "foo",
    });

    const allSIds = Object.values(groups)
      .flat()
      .map((c) => c.sId);
    expect(allSIds).toEqual(["match"]);
  });
});
