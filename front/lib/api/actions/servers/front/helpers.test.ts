import {
  formatConversationForLLM,
  formatConversationsForLLM,
  getConversationInboxes,
  MAX_RETRIES,
  makeFrontAPIRequest,
  parseFrontConversation,
  parseRetryAfterMs,
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

  it("accepts a recipient without a name", () => {
    const conversation = parseFrontConversation({
      id: "cnv_123",
      status: "open",
      recipient: {
        handle: "customer@example.com",
        name: null,
      },
    });

    expect(formatConversationForLLM(conversation, [])).toContain(
      "RECIPIENT: customer@example.com"
    );
  });
});

describe("formatConversationsForLLM", () => {
  it("stops loading inboxes when the token lacks permission", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("Forbidden", { status: 403 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const formatted = await formatConversationsForLLM("front-token", [
      { id: "cnv_1", status: "open" },
      { id: "cnv_2", status: "open" },
      { id: "cnv_3", status: "open" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(formatted).toHaveLength(3);
    expect(formatted.join("\n")).toContain(
      "INBOX: Unknown (Front token needs inboxes:read)"
    );
  });

  it("keeps conversations when one inbox lookup fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ _results: [{ name: "Support" }] }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);

    const formatted = await formatConversationsForLLM("front-token", [
      { id: "cnv_1", status: "open" },
      { id: "cnv_2", status: "open" },
    ]);

    expect(formatted).toHaveLength(2);
    expect(formatted[0]).toContain("INBOX: Support");
    expect(formatted[1]).toContain(
      "INBOX: Unknown (Front inboxes could not be loaded)"
    );
  });
});

describe("parseRetryAfterMs", () => {
  const now = Date.parse("2026-10-15T05:00:00Z");

  it("parses a number of seconds", () => {
    expect(parseRetryAfterMs("2", now)).toBe(2000);
    expect(parseRetryAfterMs("0", now)).toBe(0);
  });

  it("parses a date relative to now", () => {
    expect(parseRetryAfterMs("Thu, 15 Oct 2026 05:00:05 GMT", now)).toBe(5000);
  });

  it("treats a date in the past as no wait", () => {
    expect(parseRetryAfterMs("Thu, 15 Oct 2026 04:59:00 GMT", now)).toBe(0);
  });

  it("returns null for missing or invalid values", () => {
    expect(parseRetryAfterMs(null, now)).toBeNull();
    expect(parseRetryAfterMs("", now)).toBeNull();
    expect(parseRetryAfterMs("soon", now)).toBeNull();
    expect(parseRetryAfterMs("-3", now)).toBeNull();
  });

  it("keeps very large values finite", () => {
    const huge = parseRetryAfterMs("9".repeat(400), now);
    expect(Number.isFinite(huge)).toBe(true);
    expect(huge).toBeGreaterThan(10_000);
  });
});

describe("makeFrontAPIRequest rate limiting", () => {
  const options = {
    method: "GET",
    endpoint: "conversations",
    apiToken: "front-token",
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("waits the requested number of seconds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "2" } })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const promise = makeFrontAPIRequest(options);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("waits for a Retry-After date instead of retrying immediately", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T05:00:00Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", {
          status: 429,
          headers: { "Retry-After": "Thu, 15 Oct 2026 05:00:05 GMT" },
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const promise = makeFrontAPIRequest(options);
    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry early or sleep when Front asks for a long wait", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("", { status: 429, headers: { "Retry-After": "3600" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(makeFrontAPIRequest(options)).rejects.toThrow(
      /retry in 3600 seconds/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not sleep when a Retry-After date is further out than the wait limit", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T05:00:00Z"));
    const fetchMock = vi.fn(
      async () =>
        new Response("", {
          status: 429,
          headers: { "Retry-After": "Thu, 15 Oct 2026 06:00:00 GMT" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(makeFrontAPIRequest(options)).rejects.toThrow(
      /retry in 3600 seconds/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to backoff when Retry-After is invalid", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "Retry-After": "soon" } })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const promise = makeFrontAPIRequest(options);
    await vi.advanceTimersByTimeAsync(999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("uses exponential backoff when Retry-After is missing", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response("", { status: 429 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);

    const promise = makeFrontAPIRequest(options);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    await expect(promise).resolves.toEqual({ ok: true });
  });

  it("stops after the retry limit", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(
      async () =>
        new Response("", { status: 429, headers: { "Retry-After": "0" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const assertion = expect(makeFrontAPIRequest(options)).rejects.toThrow(
      /rate limit exceeded/
    );
    await vi.runAllTimersAsync();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES + 1);
  });

  it("does not retry other errors", async () => {
    const fetchMock = vi.fn(async () => new Response("boom", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(makeFrontAPIRequest(options)).rejects.toThrow(
      /Front API error \(500\)/
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
