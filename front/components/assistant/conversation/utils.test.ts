import {
  getAutoScrollEnabled,
  getGroupConversationsByUnreadAndActionRequired,
} from "@app/components/assistant/conversation/utils";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

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

describe("getAutoScrollEnabled", () => {
  it("keeps following streamed content when the viewport does not move", () => {
    expect(
      getAutoScrollEnabled({
        isAutoScrollEnabled: true,
        previousLocation: { bottomOffset: 0, listOffset: -600 },
        location: { bottomOffset: 120, listOffset: -600 },
      })
    ).toBe(true);
  });

  it("detaches when the reader scrolls up while content grows", () => {
    expect(
      getAutoScrollEnabled({
        isAutoScrollEnabled: true,
        previousLocation: { bottomOffset: 0, listOffset: -600 },
        location: { bottomOffset: 200, listOffset: -520 },
      })
    ).toBe(false);
  });

  it("stays detached while the reader scrolls down before the bottom", () => {
    expect(
      getAutoScrollEnabled({
        isAutoScrollEnabled: false,
        previousLocation: { bottomOffset: 200, listOffset: -520 },
        location: { bottomOffset: 140, listOffset: -580 },
      })
    ).toBe(false);
  });

  it("re-attaches at the bottom while content grows", () => {
    expect(
      getAutoScrollEnabled({
        isAutoScrollEnabled: false,
        previousLocation: { bottomOffset: 200, listOffset: -520 },
        location: { bottomOffset: 0, listOffset: -720 },
      })
    ).toBe(true);
  });
});
