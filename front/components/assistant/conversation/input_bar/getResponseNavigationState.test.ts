import { getResponseNavigationState } from "@app/components/assistant/conversation/input_bar/getResponseNavigationState";
import { describe, expect, it } from "vitest";

describe("getResponseNavigationState", () => {
  const initial = {
    conversationId: "one",
    generatingMessageId: undefined,
    unseenCompletedMessageId: null,
  };

  it("remembers the completed answer until it is seen", () => {
    const generating = getResponseNavigationState(initial, {
      conversationId: "one",
      generatingMessageId: "answer",
      atBottom: false,
    });
    const completed = getResponseNavigationState(generating, {
      conversationId: "one",
      generatingMessageId: undefined,
      atBottom: false,
    });

    expect(completed.unseenCompletedMessageId).toBe("answer");
    expect(
      getResponseNavigationState(completed, {
        conversationId: "one",
        generatingMessageId: undefined,
        atBottom: true,
      }).unseenCompletedMessageId
    ).toBeNull();
  });

  it("clears an unseen answer when a new generation starts or the conversation changes", () => {
    const completed = {
      ...initial,
      unseenCompletedMessageId: "answer",
    };
    expect(
      getResponseNavigationState(completed, {
        conversationId: "one",
        generatingMessageId: "next",
        atBottom: false,
      }).unseenCompletedMessageId
    ).toBeNull();
    expect(
      getResponseNavigationState(completed, {
        conversationId: "two",
        generatingMessageId: undefined,
        atBottom: false,
      }).unseenCompletedMessageId
    ).toBeNull();
  });

  it("does not show a completion when a blocked question resumes", () => {
    const generating = {
      ...initial,
      generatingMessageId: "question",
    };
    const blocked = getResponseNavigationState(generating, {
      conversationId: "one",
      generatingMessageId: undefined,
      atBottom: false,
    });
    expect(blocked.unseenCompletedMessageId).toBe("question");

    const resumed = getResponseNavigationState(blocked, {
      conversationId: "one",
      generatingMessageId: "question",
      atBottom: false,
    });
    expect(resumed.unseenCompletedMessageId).toBeNull();
  });

  it("reuses unchanged state without another render update", () => {
    expect(
      getResponseNavigationState(initial, {
        conversationId: "one",
        generatingMessageId: undefined,
        atBottom: false,
      })
    ).toBe(initial);
  });
});
