import { describe, expect, it } from "vitest";

import { validatePodConversationMessageTarget } from "./index";

describe("validatePodConversationMessageTarget", () => {
  it("rejects a missing target conversation", () => {
    const result = validatePodConversationMessageTarget({
      conversationId: undefined,
      currentConversationId: "conversation-current",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain("conversationId is required");
    }
  });

  it("rejects the active conversation", () => {
    const result = validatePodConversationMessageTarget({
      conversationId: "conversation-current",
      currentConversationId: "conversation-current",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toContain(
        "cannot post to the active conversation"
      );
    }
  });

  it("accepts a different conversation", () => {
    const result = validatePodConversationMessageTarget({
      conversationId: "conversation-target",
      currentConversationId: "conversation-current",
    });

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value).toBe("conversation-target");
    }
  });
});
