import { ErrorCode, WebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";

vi.mock(import("@connectors/lib/throttle"), () => ({
  throttleWithRedis: <T>(
    _rateLimit: unknown,
    _key: string,
    _options: unknown,
    func: () => Promise<T>
  ) => func(),
}));

import {
  getSlackBotInfoFromMessage,
  resolveSlackBotInfo,
} from "@connectors/connectors/slack/lib/bot_identity";

const connectorId = 123;
const channelId = "C123";
const messageTs = "1700000002.000001";

function makeSlackPlatformError(error: string) {
  return Object.assign(new Error(error), {
    code: ErrorCode.PlatformError,
    data: { error, ok: false },
  });
}

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
      threadTs: messageTs,
      messageTs,
    });

    expect(replies).toHaveBeenCalledWith(
      expect.objectContaining({ channel: channelId, ts: messageTs })
    );
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

    const replies = vi.spyOn(slackClient.conversations, "replies");

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      threadTs: parentTs,
      messageTs,
    });

    expect(replies).toHaveBeenCalledWith(
      expect.objectContaining({ channel: channelId, ts: parentTs })
    );
    expect(info?.real_name).toBe("Onboarding requests");
  });

  it("finds the reply on a later page of a long thread", async () => {
    const parentTs = "1700000000.000001";
    const parent = { ts: parentTs, user: "U123", text: "parent" };
    const firstPage: Record<string, unknown>[] = [
      parent,
      { ts: "1700000009.000001", thread_ts: parentTs, user: "U123" },
    ];
    const secondPage: Record<string, unknown>[] = [
      parent,
      {
        ts: messageTs,
        thread_ts: parentTs,
        subtype: "bot_message",
        username: "Onboarding requests ",
      },
    ];
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.conversations, "replies")
      .mockResolvedValueOnce({
        ok: true,
        messages: firstPage,
        response_metadata: { next_cursor: "page-2" },
      })
      .mockResolvedValueOnce({ ok: true, messages: secondPage });

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      threadTs: parentTs,
      messageTs,
    });

    expect(info?.real_name).toBe("Onboarding requests");
  });

  it("returns null when Slack reports the message as gone", async () => {
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.conversations, "replies").mockRejectedValue(
      makeSlackPlatformError("thread_not_found")
    );

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      threadTs: messageTs,
      messageTs,
    });

    expect(info).toBeNull();
  });

  it("propagates other Slack errors", async () => {
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.conversations, "replies").mockRejectedValue(
      makeSlackPlatformError("channel_not_found")
    );

    await expect(
      getSlackBotInfoFromMessage(connectorId, slackClient, {
        channelId,
        threadTs: messageTs,
        messageTs,
      })
    ).rejects.toThrow("channel_not_found");
  });

  it("tolerates null icons on the message", async () => {
    const { slackClient } = makeSlackClient([
      { ts: messageTs, username: "Onboarding requests", icons: null },
    ]);

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      threadTs: messageTs,
      messageTs,
    });

    expect(info).toMatchObject({
      real_name: "Onboarding requests",
      image_512: null,
    });
  });

  it("ignores messages with another ts", async () => {
    const { slackClient } = makeSlackClient([
      { ts: "1700000001.000001", username: "Other workflow" },
    ]);

    const info = await getSlackBotInfoFromMessage(connectorId, slackClient, {
      channelId,
      threadTs: messageTs,
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
      threadTs: messageTs,
      messageTs,
    });

    expect(info).toBeNull();
  });
});

describe("resolveSlackBotInfo", () => {
  const params = {
    slackBotId: "B0TESTWORKF",
    slackBotUsername: undefined,
    channelId,
    threadTs: messageTs,
    messageTs,
  };

  it("uses bots.info when Slack resolves the bot", async () => {
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.bots, "info").mockResolvedValue({
      ok: true,
      bot: { name: "Resolved bot " },
    });
    const replies = vi.spyOn(slackClient.conversations, "replies");

    const info = await resolveSlackBotInfo(connectorId, slackClient, {
      ...params,
      slackBotUsername: "Event name",
    });

    expect(info?.real_name).toBe("Resolved bot");
    expect(replies).not.toHaveBeenCalled();
  });

  it("falls back to the event username when bots.info returns a nameless bot", async () => {
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.bots, "info").mockResolvedValue({ ok: true, bot: {} });

    const info = await resolveSlackBotInfo(connectorId, slackClient, {
      ...params,
      slackBotUsername: "Onboarding requests ",
    });

    expect(info?.real_name).toBe("Onboarding requests");
  });

  it("falls back to the trimmed event username on bot_not_found", async () => {
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.bots, "info").mockRejectedValue(
      makeSlackPlatformError("bot_not_found")
    );
    const replies = vi.spyOn(slackClient.conversations, "replies");

    const info = await resolveSlackBotInfo(connectorId, slackClient, {
      ...params,
      slackBotUsername: "Onboarding requests ",
    });

    expect(info).toMatchObject({
      is_bot: true,
      real_name: "Onboarding requests",
      display_name: "Onboarding requests",
    });
    expect(replies).not.toHaveBeenCalled();
  });

  it("falls back to the message username when the event has none", async () => {
    const { slackClient } = makeSlackClient([
      { ts: messageTs, username: "Onboarding requests " },
    ]);
    vi.spyOn(slackClient.bots, "info").mockRejectedValue(
      makeSlackPlatformError("bot_not_found")
    );

    const info = await resolveSlackBotInfo(connectorId, slackClient, {
      ...params,
      slackBotUsername: "  ",
    });

    expect(info?.real_name).toBe("Onboarding requests");
  });

  it("returns null when no source names the bot", async () => {
    const { slackClient } = makeSlackClient([{ ts: messageTs }]);
    vi.spyOn(slackClient.bots, "info").mockRejectedValue(
      makeSlackPlatformError("bot_not_found")
    );

    const info = await resolveSlackBotInfo(connectorId, slackClient, params);

    expect(info).toBeNull();
  });

  it("propagates bots.info errors other than bot_not_found", async () => {
    const slackClient = new WebClient("test-token");
    vi.spyOn(slackClient.bots, "info").mockRejectedValue(
      makeSlackPlatformError("invalid_auth")
    );

    await expect(
      resolveSlackBotInfo(connectorId, slackClient, {
        ...params,
        slackBotUsername: "Onboarding requests",
      })
    ).rejects.toThrow("invalid_auth");
  });
});
