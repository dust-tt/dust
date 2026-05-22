import type { ConversationEvent } from "@dust-tt/client";
import { Ok } from "@dust-tt/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@connectors/lib/bot/conversation_utils", () => ({
  makeConversationUrl: () => "https://dust.test/conversation",
}));

import { resolveSlackPendingUserMessage } from "./bot_pending_message";

type PendingMessage =
  | { sId: string; type: "user_message"; visibility: "pending" | "visible" }
  | { type: "agent_message"; parentMessageId: string };

const connector = { id: 123, workspaceId: "w_test" };
const pendingUserMessage = {
  sId: "user_msg_1",
  type: "user_message",
  visibility: "pending",
} satisfies PendingMessage;

function makeConversation(content: PendingMessage[][] = []) {
  return { sId: "conv_1", content };
}

async function resolvePending({
  events = [],
  refetchedConversation = makeConversation([[pendingUserMessage]]),
  stopRejects = false,
  timeoutMs = 100,
}: {
  events?: ConversationEvent[];
  refetchedConversation?: ReturnType<typeof makeConversation>;
  stopRejects?: boolean;
  timeoutMs?: number;
} = {}) {
  const dustAPI = {
    streamConversationEvents: vi.fn(
      async ({ signal }: { signal?: AbortSignal }) => {
        return new Ok({ eventStream: pendingEventsStream(events, signal) });
      }
    ),
    getConversation: vi.fn(async () => new Ok(refetchedConversation)),
  };
  const slackClient = {
    chat: {
      postMessage: vi.fn(async () => ({ ok: true, ts: "fallback_ts" })),
    },
  };
  const streamHandler = {
    stop: vi.fn(async () => {
      if (stopRejects) {
        throw new Error("stop failed");
      }
    }),
  };

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
    timeoutMs,
    userMessage: pendingUserMessage,
  });

  return { res, slackClient, streamHandler };
}

async function* pendingEventsStream(
  events: ConversationEvent[],
  signal?: AbortSignal
) {
  if (events.length === 0) {
    await new Promise<void>((resolve) => {
      signal?.addEventListener("abort", () => resolve(), { once: true });
    });
  }

  yield* events;
}

describe("resolveSlackPendingUserMessage", () => {
  it("continues after the pending message is promoted", async () => {
    const promotedConversation = makeConversation([
      [{ ...pendingUserMessage, visibility: "visible" }],
      [{ type: "agent_message", parentMessageId: pendingUserMessage.sId }],
    ]);
    const ctx = await resolvePending({
      events: [
        {
          type: "user_message_promoted",
          created: Date.now(),
          messageId: pendingUserMessage.sId,
        },
      ],
      refetchedConversation: promotedConversation,
    });

    expect(ctx.res).toEqual(new Ok(promotedConversation));
  });

  it("posts a fallback when the pending message is not promoted", async () => {
    const ctx = await resolvePending({ stopRejects: true, timeoutMs: 1 });

    expect(ctx.res).toEqual(new Ok(null));
    expect(ctx.streamHandler.stop).toHaveBeenCalledTimes(1);
    expect(ctx.slackClient.chat.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: "C123",
        thread_ts: "1700000000.000001",
        text: expect.stringContaining("Continue on Dust"),
      })
    );
  });
});
