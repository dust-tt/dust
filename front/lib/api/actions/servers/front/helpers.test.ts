import {
  formatConversationForLLM,
  getConversationInboxes,
} from "@app/lib/api/actions/servers/front/helpers";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getConversationInboxes", () => {
  it("fetches the inboxes attached to a conversation", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          _results: [{ id: "inb_support", name: "Support", is_private: false }],
        }),
        { status: 200 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getConversationInboxes("front-token", "cnv_123")
    ).resolves.toEqual([{ name: "Support" }]);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api2.frontapp.com/conversations/cnv_123/inboxes",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer front-token",
          "Content-Type": "application/json",
        },
      }
    );
  });

  it("keeps metadata available without inbox permissions", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Forbidden", { status: 403 }))
    );

    const inboxes = await getConversationInboxes("front-token", "cnv_123");
    const formatted = formatConversationForLLM(
      {
        id: "cnv_123",
        status: "open",
      },
      inboxes
    );

    expect(formatted).toContain(
      "INBOX: Unknown (Front token needs inboxes:read)"
    );
  });
});

describe("formatConversationForLLM", () => {
  it("includes every inbox containing the conversation", () => {
    const formatted = formatConversationForLLM(
      {
        id: "cnv_123",
        status: "open",
      },
      [{ name: "Support" }, { name: "Escalations" }]
    );

    expect(formatted).toContain("INBOX: Support, Escalations");
  });
});
