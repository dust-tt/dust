import { getConversationDisplayTitle } from "@app/types/assistant/conversation";
import { describe, expect, it } from "vitest";

describe("getConversationDisplayTitle", () => {
  const now = new Date("2026-04-20T12:00:00Z");

  it("returns the persisted title when present", () => {
    expect(
      getConversationDisplayTitle(
        {
          title: "Weekly planning",
          created: now.getTime(),
        },
        now
      )
    ).toBe("Weekly planning");
  });

  it("returns the new conversation fallback on the same day", () => {
    expect(
      getConversationDisplayTitle(
        {
          title: null,
          created: now.getTime(),
        },
        now
      )
    ).toBe("New Conversation");
  });

  it("renders a fork title from the parent title", () => {
    expect(
      getConversationDisplayTitle(
        {
          title: null,
          created: now.getTime(),
          forkedFrom: {
            parentConversationTitle: "Quarterly review",
          },
        },
        now
      )
    ).toBe("Branched from 'Quarterly review'");
  });

  it("renders a generic fork title when the parent title is unavailable", () => {
    expect(
      getConversationDisplayTitle(
        {
          title: null,
          created: now.getTime(),
          forkedFrom: {
            parentConversationTitle: null,
          },
        },
        now
      )
    ).toBe("Forked conversation");
  });

  it("keeps the existing fallback for untitled non-fork conversations", () => {
    expect(
      getConversationDisplayTitle(
        {
          title: null,
          created: new Date("2026-04-19T12:00:00Z").getTime(),
        },
        now
      )
    ).toBe(
      `Conversation from ${new Date("2026-04-19T12:00:00Z").toLocaleDateString()}`
    );
  });
});
