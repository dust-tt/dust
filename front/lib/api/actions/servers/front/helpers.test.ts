import {
  formatConversationForLLM,
  getConversationInboxes,
} from "@app/lib/api/actions/servers/front/helpers";
import { TOOLS } from "@app/lib/api/actions/servers/front/tools";
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

function getTool(name: string) {
  const tool = TOOLS.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Tool ${name} not found`);
  }
  return tool;
}

function createTestExtra() {
  return {
    authInfo: { token: "front-token" },
  } as Parameters<(typeof TOOLS)[0]["handler"]>[1];
}

describe("search_conversations", () => {
  it("stops loading inboxes when the token lacks permission", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            _results: [
              { id: "cnv_1", status: "open" },
              { id: "cnv_2", status: "open" },
              { id: "cnv_3", status: "open" },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValue(new Response("Forbidden", { status: 403 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTool("search_conversations").handler(
      { q: "support", limit: 20 },
      createTestExtra()
    );

    expect(result.isOk()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining(
          "INBOX: Unknown (Front token needs inboxes:read)"
        ),
      });
    }
  });

  it("keeps conversations when one inbox lookup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            _results: [
              { id: "cnv_1", status: "open" },
              { id: "cnv_2", status: "open" },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ _results: [{ name: "Support" }] }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTool("search_conversations").handler(
      { q: "support", limit: 20 },
      createTestExtra()
    );

    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0]).toMatchObject({
        type: "text",
        text: expect.stringContaining(
          "INBOX: Unknown (Front inboxes could not be loaded)"
        ),
      });
    }
  });
});
