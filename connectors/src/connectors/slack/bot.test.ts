import type { ConversationEvent } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";
import { describe, expect, it, vi } from "vitest";

vi.mock("@connectors/lib/bot/conversation_utils", () => ({
  makeConversationUrl: () => "https://dust.test/conversation",
}));

import { resolveSlackPendingUserMessage } from "./bot";

type PendingUserMessage = {
  sId: string;
  type: "user_message";
  visibility: "pending" | "visible";
};

type PendingConversation = {
  sId: string;
  content: (
    | PendingUserMessage
    | {
        type: "agent_message";
        parentMessageId: string;
      }
  )[][];
};

const connector = {
  id: 123,
  workspaceId: "w_test",
};

const slackMessageTs = "1700000000.000001";
const pendingUserMessage: PendingUserMessage = {
  sId: "user_msg_1",
  type: "user_message",
  visibility: "pending",
};

async function* neverPromotedEventStream(signal?: AbortSignal) {
  await new Promise<void>((resolve) => {
    signal?.addEventListener("abort", () => resolve(), { once: true });
  });
}

const promotedEvent = {
  type: "user_message_promoted",
  created: Date.now(),
  messageId: pendingUserMessage.sId,
} satisfies ConversationEvent;

async function* promotedEventStream() {
  yield promotedEvent;
}

function makeConversation(content: PendingConversation["content"] = []) {
  return { sId: "conv_1", content };
}

async function resolvePending({
  eventStream = neverPromotedEventStream,
  refetchedConversation = makeConversation([[pendingUserMessage]]),
  timeoutMs = 100,
}: {
  eventStream?: (signal?: AbortSignal) => AsyncGenerator<ConversationEvent>;
  refetchedConversation?: PendingConversation;
  timeoutMs?: number;
} = {}) {
  const dustAPI = {
    streamConversationEvents: vi.fn(
      async ({ signal }: { signal?: AbortSignal }) => {
        return new Ok({ eventStream: eventStream(signal) });
      }
    ),
    getConversation: vi.fn(async () => {
      return new Ok(refetchedConversation);
    }),
  };
  const slackClient = {
    chat: {
      postMessage: vi.fn<WebClient["chat"]["postMessage"]>(async () => ({
        ok: true,
        ts: "fallback_ts",
      })),
    },
  };
  const streamHandler = {
    stop: vi.fn(async () => undefined),
  };

  const res = await resolveSlackPendingUserMessage({
    connector,
    conversation: makeConversation([[pendingUserMessage]]),
    dustAPI,
    slack: {
      slackChannelId: "C123",
      slackClient,
      slackMessageTs,
    },
    streamHandler,
    timeoutMs,
    userMessage: pendingUserMessage,
  });

  return { dustAPI, res, slackClient, streamHandler };
}

describe("resolveSlackPendingUserMessage", () => {
  it("refetches the conversation and streams normally after promotion", async () => {
    const promotedConversation = makeConversation([
      [{ ...pendingUserMessage, visibility: "visible" }],
      [{ type: "agent_message", parentMessageId: pendingUserMessage.sId }],
    ]);
    const ctx = await resolvePending({
      eventStream: promotedEventStream,
      refetchedConversation: promotedConversation,
    });

    expect(ctx.res).toEqual(new Ok(promotedConversation));
  });

  it("posts a controlled fallback when the pending message is not promoted", async () => {
    const ctx = await resolvePending({ timeoutMs: 1 });

    expect(ctx.res).toEqual(new Ok(null));
    expect(ctx.streamHandler.stop).toHaveBeenCalledTimes(1);
    expect(ctx.slackClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        thread_ts: slackMessageTs,
        text: expect.stringContaining("Continue on Dust"),
      })
    );
  });
});
