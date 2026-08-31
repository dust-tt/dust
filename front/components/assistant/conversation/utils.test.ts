import {
  getGroupConversationsByUnreadAndActionRequired,
  getNextAutoScrollState,
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

describe("getNextAutoScrollState", () => {
  it("stays attached when streamed content moves the bottom away", () => {
    expect(
      getNextAutoScrollState(
        { isEnabled: true, hasLeftBottom: false },
        { type: "scroll", bottomOffset: 120 }
      )
    ).toEqual({ isEnabled: true, hasLeftBottom: false });
  });

  it("detaches immediately when the reader scrolls up", () => {
    expect(
      getNextAutoScrollState(
        { isEnabled: true, hasLeftBottom: false },
        { type: "user_scrolled_up" }
      )
    ).toEqual({ isEnabled: false, hasLeftBottom: false });
  });

  it("does not re-attach to a stale bottom event after detaching", () => {
    expect(
      getNextAutoScrollState(
        { isEnabled: false, hasLeftBottom: false },
        { type: "scroll", bottomOffset: 0 }
      )
    ).toEqual({ isEnabled: false, hasLeftBottom: false });
  });

  it("preserves the evidence that the reader left the bottom", () => {
    const awayFromBottom = getNextAutoScrollState(
      { isEnabled: false, hasLeftBottom: false },
      { type: "scroll", bottomOffset: 100 }
    );

    expect(
      getNextAutoScrollState(awayFromBottom, {
        type: "user_scrolled_up",
      })
    ).toEqual({ isEnabled: false, hasLeftBottom: true });
  });

  it("re-attaches after the reader returns to the bottom", () => {
    expect(
      getNextAutoScrollState(
        { isEnabled: false, hasLeftBottom: true },
        { type: "scroll", bottomOffset: 0.5 }
      )
    ).toEqual({ isEnabled: true, hasLeftBottom: false });
  });
});
