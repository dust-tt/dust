import { conversationGoalKey } from "@app/lib/swr/conversation_goals";
import { describe, expect, it } from "vitest";

describe("conversationGoalKey", () => {
  it("includes the branch in the cache key", () => {
    expect(
      conversationGoalKey({
        workspaceId: "w1",
        conversationId: "c1",
        branchId: "branch/one",
      })
    ).toBe("/api/w/w1/assistant/conversations/c1/goal?branchId=branch%2Fone");
  });

  it("uses the root endpoint without a branch", () => {
    expect(
      conversationGoalKey({
        workspaceId: "w1",
        conversationId: "c1",
        branchId: null,
      })
    ).toBe("/api/w/w1/assistant/conversations/c1/goal");
  });
});
