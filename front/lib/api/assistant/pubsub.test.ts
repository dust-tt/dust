import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisHybridManager = vi.hoisted(() => ({
  subscribe: vi.fn(),
  readEventsAfter: vi.fn(),
}));

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: () => redisHybridManager,
}));

import { getMessagesEventsBatch } from "./pubsub";

type SubscriptionCallback = (event: EventPayload | "close") => void;

describe("getMessagesEventsBatch", () => {
  beforeEach(() => {
    redisHybridManager.subscribe.mockReset();
    redisHybridManager.readEventsAfter.mockReset().mockResolvedValue([]);
  });

  it("returns history and unsubscribes", async () => {
    const unsubscribe = vi.fn();
    const history: EventPayload[] = [
      {
        id: "1-0",
        message: { payload: JSON.stringify({ type: "end-of-stream" }) },
      },
    ];
    redisHybridManager.subscribe.mockResolvedValue({
      history: [],
      unsubscribe,
    });
    redisHybridManager.readEventsAfter.mockResolvedValue(history);

    const events = await getMessagesEventsBatch({
      messageId: "msg_1",
      lastEventId: "0-0",
      signal: new AbortController().signal,
    });

    expect(events).toEqual([
      { eventId: "1-0", data: { type: "end-of-stream" } },
    ]);
    expect(redisHybridManager.subscribe).toHaveBeenCalledWith(
      "message-msg_1",
      expect.any(Function),
      "message_events_long_poll",
      {
        skipHistory: true,
        signal: expect.any(AbortSignal),
      }
    );
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("returns and unsubscribes when the request is aborted", async () => {
    const unsubscribe = vi.fn();
    redisHybridManager.subscribe.mockResolvedValue({
      history: [],
      unsubscribe,
    });
    const controller = new AbortController();

    const eventsPromise = getMessagesEventsBatch({
      messageId: "msg_1",
      lastEventId: null,
      signal: controller.signal,
    });
    await vi.waitFor(() =>
      expect(redisHybridManager.subscribe).toHaveBeenCalledOnce()
    );
    controller.abort();

    await expect(eventsPromise).resolves.toEqual([]);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("waits for and batches live events when history is empty", async () => {
    const unsubscribe = vi.fn();
    const callbackRegistered = Promise.withResolvers<SubscriptionCallback>();
    redisHybridManager.subscribe.mockImplementation(
      async (_channel, callback) => {
        callbackRegistered.resolve(callback);
        return { history: [], unsubscribe };
      }
    );

    const eventsPromise = getMessagesEventsBatch({
      messageId: "msg_1",
      lastEventId: null,
      signal: new AbortController().signal,
    });
    redisHybridManager.readEventsAfter
      .mockResolvedValueOnce([])
      .mockResolvedValue([
        {
          id: "2-0",
          message: { payload: JSON.stringify({ type: "agent_message_delta" }) },
        },
        {
          id: "3-0",
          message: { payload: JSON.stringify({ type: "end-of-stream" }) },
        },
      ]);
    const publishEvent = await callbackRegistered.promise;
    publishEvent({
      id: "2-0",
      message: { payload: JSON.stringify({ type: "agent_message_delta" }) },
    });
    publishEvent({
      id: "3-0",
      message: { payload: JSON.stringify({ type: "end-of-stream" }) },
    });

    await expect(eventsPromise).resolves.toEqual([
      { eventId: "2-0", data: { type: "agent_message_delta" } },
      { eventId: "3-0", data: { type: "end-of-stream" } },
    ]);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("returns and unsubscribes when the subscription closes", async () => {
    const unsubscribe = vi.fn();
    const callbackRegistered = Promise.withResolvers<SubscriptionCallback>();
    redisHybridManager.subscribe.mockImplementation(
      async (_channel, callback) => {
        callbackRegistered.resolve(callback);
        return { history: [], unsubscribe };
      }
    );

    const eventsPromise = getMessagesEventsBatch({
      messageId: "msg_1",
      lastEventId: null,
      signal: new AbortController().signal,
    });
    const closeSubscription = await callbackRegistered.promise;
    closeSubscription("close");

    await expect(eventsPromise).resolves.toEqual([]);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
  it("releases a subscription cancelled while setup is pending", async () => {
    const unsubscribe = vi.fn();
    const subscription = Promise.withResolvers<{
      history: EventPayload[];
      unsubscribe: () => void;
    }>();
    redisHybridManager.subscribe.mockReturnValue(subscription.promise);
    const controller = new AbortController();
    const result = getMessagesEventsBatch({
      messageId: "pending",
      lastEventId: null,
      signal: controller.signal,
    });
    controller.abort();
    subscription.resolve({ history: [], unsubscribe });
    await expect(result).resolves.toEqual([]);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
