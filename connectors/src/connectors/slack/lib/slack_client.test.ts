import { WebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@connectors/lib/throttle"), () => ({
  throttleWithRedis: <T>(
    _rateLimit: unknown,
    _key: string,
    _options: unknown,
    func: () => Promise<T>
  ) => func(),
}));

import { getSlackBotInfoFromMessage } from "./slack_client";

const connectorId = 123;
const channelId = "C123";
const messageTs = "1700000002.000001";

function makeSlackClient(messages: Record<string, unknown>[]) {
  const slackClient = new WebClient("test-token");
  const replies = vi
    .spyOn(slackClient.conversations, "replies")
    .mockResolvedValue({ ok: true, messages });
  return { slackClient, replies };
}

describe("getSlackBotInfoFromMessage", () => {
  it("names the bot after the trimmed username of the message", async () => {
    const { slackClient, replies } = makeSlackClient([
      {
        ts: messageTs,
        subtype: "bot_message",
        bot_id: "B0TESTWORKF",
        username: "Onboarding requests ",
        icons: { image_72: "https://slack.test/workflow_72.png" },
      },
    ]);

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      messageTs,
    });

    expect(replies).toHaveBeenCalledWith({
      channel: channelId,
      ts: messageTs,
    });
    expect(info).toMatchObject({
      is_bot: true,
      real_name: "Onboarding requests",
      display_name: "Onboarding requests",
      name: "Onboarding requests",
      image_512: "https://slack.test/workflow_72.png",
    });
  });

  it("selects the threaded reply when Slack returns the thread parent first", async () => {
    const parentTs = "1700000000.000001";
    const { slackClient } = makeSlackClient([
      { ts: parentTs, user: "U123", text: "parent" },
      {
        ts: messageTs,
        thread_ts: parentTs,
        subtype: "bot_message",
        bot_id: "B0TESTWORKF",
        username: "Onboarding requests ",
      },
      { ts: "1700000003.000001", thread_ts: parentTs, username: "Other bot" },
    ]);

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      messageTs,
    });

    expect(info?.real_name).toBe("Onboarding requests");
  });

  it("throws on a Slack error response", async () => {
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.conversations, "replies").mockResolvedValue({
      ok: false,
      error: "thread_not_found",
    });

    await expect(
      getSlackBotInfoFromMessage(connectorId, slackClient, {
        channelId,
        messageTs,
      })
    ).rejects.toThrow("thread_not_found");
  });

  it("ignores messages with another ts", async () => {
    const { slackClient } = makeSlackClient([
      { ts: "1700000001.000001", username: "Other workflow" },
    ]);

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      messageTs,
    });

    expect(info).toBeNull();
  });

  it("returns null when the message has no username", async () => {
    const { slackClient } = makeSlackClient([
      { ts: messageTs, bot_id: "B0TESTWORKF", username: "  " },
    ]);

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      messageTs,
    });

    expect(info).toBeNull();
  });
});
