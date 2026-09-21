import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisHybridManager = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: () => redisHybridManager,
}));

import { getMessagesEventsBatch } from "./pubsub";

type SubscriptionCallback = (event: EventPayload | "close") => void;

describe("getMessagesEventsBatch", () => {
  beforeEach(() => {
    redisHybridManager.subscribe.mockReset();
  });

  it("returns history in numeric Redis stream order and unsubscribes", async () => {
    const unsubscribe = vi.fn();
    const history: EventPayload[] = [
      {
        id: "1770000000000-10",
        message: { payload: JSON.stringify({ type: "end-of-stream" }) },
      },
      {
        id: "1770000000000-2",
        message: { payload: JSON.stringify({ type: "end-of-stream" }) },
      },
    ];
    redisHybridManager.subscribe.mockResolvedValue({ history, unsubscribe });

    const events = await getMessagesEventsBatch({
      messageId: "msg_1",
      lastEventId: "0-0",
      signal: new AbortController().signal,
    });

    expect(events).toEqual([
      {
        eventId: "1770000000000-2",
        data: { type: "end-of-stream" },
      },
      {
        eventId: "1770000000000-10",
        data: { type: "end-of-stream" },
      },
    ]);
    expect(redisHybridManager.subscribe).toHaveBeenCalledWith(
      "message-msg_1",
      expect.any(Function),
      "message_events_long_poll",
      {
        lastEventId: "0-0",
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

  it("aborts subscription setup", async () => {
    const unsubscribe = vi.fn();
    const setupStarted = Promise.withResolvers<void>();
    redisHybridManager.subscribe.mockImplementation(
      async (_channel, _callback, _origin, { signal }) => {
        setupStarted.resolve();
        await new Promise<void>((resolve) => {
          signal.addEventListener("abort", () => resolve(), { once: true });
        });
        return { history: [], unsubscribe };
      }
    );
    const controller = new AbortController();

    const eventsPromise = getMessagesEventsBatch({
      messageId: "msg_1",
      lastEventId: null,
      signal: controller.signal,
    });
    await setupStarted.promise;
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
});
