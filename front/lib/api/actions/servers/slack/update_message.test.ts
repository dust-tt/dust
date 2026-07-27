import { executeUpdateMessage } from "@app/lib/api/actions/servers/slack/helpers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockChatUpdate } = vi.hoisted(() => ({
  mockChatUpdate: vi.fn(),
}));

vi.mock("@slack/web-api", () => {
  return {
    WebClient: class MockWebClient {
      chat = {
        update: mockChatUpdate,
      };
    },
  };
});

vi.mock("@app/lib/cache/redis", () => ({
  cacheWithRedis: (fn: unknown) => fn,
}));

describe("executeUpdateMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a Slack message with a markdown block preserving raw Markdown", async () => {
    mockChatUpdate.mockResolvedValue({
      ok: true,
      channel: "C123",
      ts: "1710000000.000100",
    });

    const result = await executeUpdateMessage({
      accessToken: "xoxb-test-token",
      channel: "C123",
      timestamp: "1710000000.000100",
      message: "**Edited** message",
    });

    expect(mockChatUpdate).toHaveBeenCalledOnce();
    const updateArgs = mockChatUpdate.mock.calls[0][0];
    expect(updateArgs).toMatchObject({
      channel: "C123",
      ts: "1710000000.000100",
    });
    // The message goes into a `markdown` block with the raw GFM preserved (not
    // slackified), so tables/rich Markdown render. `text` is the plain fallback.
    expect(updateArgs.blocks).toEqual([
      { type: "markdown", text: "**Edited** message" },
    ]);
    expect(updateArgs.text).toBe("**Edited** message");
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].text).toBe(
        "Message 1710000000.000100 updated in C123"
      );
    }
  });

  it("returns an error when Slack rejects the update", async () => {
    mockChatUpdate.mockResolvedValue({
      ok: false,
      error: "message_not_found",
    });

    const result = await executeUpdateMessage({
      accessToken: "xoxb-test-token",
      channel: "C123",
      timestamp: "1710000000.000100",
      message: "Edited message",
    });

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.message).toBe("Failed to update message");
    }
  });
});
