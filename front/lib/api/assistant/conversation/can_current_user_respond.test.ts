import { canCurrentUserRespondToParentUserMessage } from "@app/lib/api/assistant/conversation/can_current_user_respond";
import { describe, expect, it } from "vitest";

describe("canCurrentUserRespondToParentUserMessage", () => {
  it("allows any viewer when the parent message has no user", () => {
    expect(
      canCurrentUserRespondToParentUserMessage({
        parentUserId: null,
        currentUserId: "user_1",
      })
    ).toBe(true);

    expect(
      canCurrentUserRespondToParentUserMessage({
        parentUserId: null,
        currentUserId: 42,
      })
    ).toBe(true);
  });

  it("allows the parent message author", () => {
    expect(
      canCurrentUserRespondToParentUserMessage({
        parentUserId: "user_1",
        currentUserId: "user_1",
      })
    ).toBe(true);

    expect(
      canCurrentUserRespondToParentUserMessage({
        parentUserId: 42,
        currentUserId: 42,
      })
    ).toBe(true);
  });

  it("denies other users when the parent message has an author", () => {
    expect(
      canCurrentUserRespondToParentUserMessage({
        parentUserId: "user_1",
        currentUserId: "user_2",
      })
    ).toBe(false);

    expect(
      canCurrentUserRespondToParentUserMessage({
        parentUserId: 1,
        currentUserId: 2,
      })
    ).toBe(false);
  });
});
