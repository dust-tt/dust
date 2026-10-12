import { executeUpdateMessage } from "@app/lib/api/actions/servers/slack/helpers";
import slackifyMarkdown from "slackify-markdown";
import { beforeEach, describe, expect, it, vi } from "vitest";

const TABLE = "| Team | Score |\n| --- | --- |\n| A | 1 |";

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

describe("executeUpdateMessage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates a message without a table as plain mrkdwn text and clears blocks", async () => {
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
      text: slackifyMarkdown("**Edited** message"),
      blocks: [],
    });
    expect(result.isOk()).toBe(true);
    if (result.isOk()) {
      expect(result.value[0].text).toBe(
        "Message 1710000000.000100 updated in C123"
      );
    }
  });

  it("updates a message with a table as a markdown block preserving raw Markdown", async () => {
    mockChatUpdate.mockResolvedValue({ ok: true });

    await executeUpdateMessage({
      accessToken: "xoxb-test-token",
      channel: "C123",
      timestamp: "1710000000.000100",
      message: TABLE,
    });

    const updateArgs = mockChatUpdate.mock.calls[0][0];
    expect(updateArgs.blocks).toEqual([{ type: "markdown", text: TABLE }]);
    expect(updateArgs.text).toBe(TABLE);
  });

  it("does not truncate long messages without a table", async () => {
    mockChatUpdate.mockResolvedValue({ ok: true });

    await executeUpdateMessage({
      accessToken: "xoxb-test-token",
      channel: "C123",
      timestamp: "1710000000.000100",
      message: "a".repeat(13_000),
    });
    expect(mockChatUpdate.mock.calls[0][0].text).toHaveLength(13_001);
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
