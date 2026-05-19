import type { SlackStreamHandler } from "@connectors/connectors/slack/chat/slack_stream_handler";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  ConversationPublicType,
  UserMessageType,
} from "@dust-tt/client";
import { Ok } from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMakeConversationUrl = vi.hoisted(() =>
  vi.fn(
    (workspaceId: string, conversationId: string | null | undefined) =>
      conversationId
        ? `https://dust.test/w/${workspaceId}/conversation/${conversationId}`
        : null
  )
);

vi.mock("@connectors/lib/bot/conversation_utils", () => ({
  makeConversationUrl: mockMakeConversationUrl,
}));

import { resolveSlackPendingUserMessage } from "./bot";

function makeConversation(
  content: ConversationPublicType["content"] = []
): ConversationPublicType {
  return {
    sId: "conv_1",
    content,
  } as ConversationPublicType;
}

function makeUserMessage(visibility: UserMessageType["visibility"]) {
  return {
    sId: "user_msg_1",
    type: "user_message",
    visibility,
  } as UserMessageType;
}

describe("resolveSlackPendingUserMessage", () => {
  const connector = {
    id: 123,
    workspaceId: "w_test",
  } as ConnectorResource;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("posts a controlled fallback when a pending message is not promoted", async () => {
    async function* emptyEventStream() {}

    const pendingUserMessage = makeUserMessage("pending");
    const dustAPI = {
      streamConversationEvents: vi.fn(async () => {
        return new Ok({ eventStream: emptyEventStream() });
      }),
      getConversation: vi.fn(async () => {
        return new Ok(makeConversation([[pendingUserMessage]]));
      }),
    };
    const slackClient = {
      chat: {
        postMessage: vi.fn(async () => ({ ts: "fallback_ts" })),
      },
    } as unknown as WebClient;
    const streamHandler = {
      stop: vi.fn(async () => undefined),
    } as Pick<SlackStreamHandler, "stop">;

    const res = await resolveSlackPendingUserMessage({
      connector,
      conversation: makeConversation([[pendingUserMessage]]),
      dustAPI,
      slack: {
        slackChannelId: "C123",
        slackClient,
        slackMessageTs: "1700000000.000001",
      },
      streamHandler,
      timeoutMs: 1,
      userMessage: pendingUserMessage,
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      throw res.error;
    }
    expect(res.value).toBeNull();
    expect(streamHandler.stop).toHaveBeenCalledTimes(1);
    expect(slackClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        thread_ts: "1700000000.000001",
        text: expect.stringContaining("Continue on Dust"),
      })
    );
  });

  it("refetches the conversation and streams normally after promotion", async () => {
    async function* promotedEventStream() {
      yield {
        type: "user_message_promoted",
        created: Date.now(),
        messageId: "user_msg_1",
      } as const;
    }

    const pendingUserMessage = makeUserMessage("pending");
    const promotedContent = [
      [{ ...pendingUserMessage, visibility: "visible" } as UserMessageType],
      [
        {
          type: "agent_message",
          parentMessageId: "user_msg_1",
        },
      ],
    ] as unknown as ConversationPublicType["content"];
    const promotedConversation = makeConversation(promotedContent);
    const dustAPI = {
      streamConversationEvents: vi.fn(async () => {
        return new Ok({ eventStream: promotedEventStream() });
      }),
      getConversation: vi.fn(async () => {
        return new Ok(promotedConversation);
      }),
    };
    const slackClient = {
      chat: {
        postMessage: vi.fn(async () => ({ ts: "fallback_ts" })),
      },
    } as unknown as WebClient;
    const streamHandler = {
      stop: vi.fn(async () => undefined),
    } as Pick<SlackStreamHandler, "stop">;

    const res = await resolveSlackPendingUserMessage({
      connector,
      conversation: makeConversation([[pendingUserMessage]]),
      dustAPI,
      slack: {
        slackChannelId: "C123",
        slackClient,
        slackMessageTs: "1700000000.000001",
      },
      streamHandler,
      timeoutMs: 100,
      userMessage: pendingUserMessage,
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      throw res.error;
    }
    expect(res.value).toBe(promotedConversation);
    expect(dustAPI.getConversation).toHaveBeenCalledWith({
      conversationId: "conv_1",
    });
    expect(streamHandler.stop).not.toHaveBeenCalled();
    expect(slackClient.chat.postMessage).not.toHaveBeenCalled();
  });

  it("posts the controlled fallback when promotion has no agent message", async () => {
    async function* promotedEventStream() {
      yield {
        type: "user_message_promoted",
        created: Date.now(),
        messageId: "user_msg_1",
      } as const;
    }

    const pendingUserMessage = makeUserMessage("pending");
    const dustAPI = {
      streamConversationEvents: vi.fn(async () => {
        return new Ok({ eventStream: promotedEventStream() });
      }),
      getConversation: vi.fn(async () => {
        return new Ok(
          makeConversation([
            [
              {
                ...pendingUserMessage,
                visibility: "visible",
              } as UserMessageType,
            ],
          ])
        );
      }),
    };
    const slackClient = {
      chat: {
        postMessage: vi.fn(async () => ({ ts: "fallback_ts" })),
      },
    } as unknown as WebClient;
    const streamHandler = {
      stop: vi.fn(async () => undefined),
    } as Pick<SlackStreamHandler, "stop">;

    const res = await resolveSlackPendingUserMessage({
      connector,
      conversation: makeConversation([[pendingUserMessage]]),
      dustAPI,
      slack: {
        slackChannelId: "C123",
        slackClient,
        slackMessageTs: "1700000000.000001",
      },
      streamHandler,
      timeoutMs: 100,
      userMessage: pendingUserMessage,
    });

    expect(res.isOk()).toBe(true);
    if (res.isErr()) {
      throw res.error;
    }
    expect(res.value).toBeNull();
    expect(streamHandler.stop).toHaveBeenCalledTimes(1);
    expect(slackClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        thread_ts: "1700000000.000001",
        text: expect.stringContaining("Continue on Dust"),
      })
    );
  });
});
