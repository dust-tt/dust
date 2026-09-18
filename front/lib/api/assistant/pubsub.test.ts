import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redisHybridManager = vi.hoisted(() => ({
  subscribe: vi.fn(),
}));

vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: () => redisHybridManager,
}));

import { getMessagesEventsBatch } from "./pubsub";

describe("getMessagesEventsBatch", () => {
  beforeEach(() => {
    redisHybridManager.subscribe.mockReset();
  });

  it("returns ordered history and unsubscribes", async () => {
    const unsubscribe = vi.fn();
    const history: EventPayload[] = [
      {
        id: "1-0",
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
      { eventId: "1-0", data: { type: "end-of-stream" } },
    ]);
    expect(redisHybridManager.subscribe).toHaveBeenCalledWith(
      "message-msg_1",
      expect.any(Function),
      "message_events_long_poll",
      { lastEventId: "0-0" }
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

  it("waits for a live event when history is empty", async () => {
    const unsubscribe = vi.fn();
    let resolveCallback: (
      callback: (event: EventPayload | "close") => void
    ) => void = () => undefined;
    const callbackRegistered = new Promise<
      (event: EventPayload | "close") => void
    >((resolve) => {
      resolveCallback = resolve;
    });
    redisHybridManager.subscribe.mockImplementation(
      async (_channel, callback) => {
        resolveCallback(callback);
        return { history: [], unsubscribe };
      }
    );

    const eventsPromise = getMessagesEventsBatch({
      messageId: "msg_1",
      lastEventId: null,
      signal: new AbortController().signal,
    });
    const publishEvent = await callbackRegistered;
    publishEvent({
      id: "2-0",
      message: { payload: JSON.stringify({ type: "end-of-stream" }) },
    });

    await expect(eventsPromise).resolves.toEqual([
      { eventId: "2-0", data: { type: "end-of-stream" } },
    ]);
    expect(unsubscribe).toHaveBeenCalledOnce();
  });
});
