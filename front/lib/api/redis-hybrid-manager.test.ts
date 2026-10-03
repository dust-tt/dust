import { getRedisEventsBatch } from "@app/lib/api/redis_events_batch";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { beforeEach, describe, expect, it, vi } from "vitest";

const redis = vi.hoisted(() => ({
  createRedisStreamClient: vi.fn(),
  setup: Promise.withResolvers<void>(),
  streamClient: {
    on: vi.fn(),
    ping: vi.fn(),
    xRead: vi.fn(),
  },
  subscriptionClient: {
    on: vi.fn(),
    ping: vi.fn(),
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
  },
}));

vi.mock("@app/lib/api/redis", () => ({
  createRedisStreamClient: redis.createRedisStreamClient,
}));

vi.mock("@app/lib/utils/statsd", () => ({
  statsDMetrics: {
    distribution: vi.fn(),
    gauge: vi.fn(),
    histogram: vi.fn(),
    increment: vi.fn(),
    timing: vi.fn(),
  },
}));

import { getRedisHybridManager } from "./redis-hybrid-manager";

describe("RedisHybridManager", () => {
  beforeEach(() => {
    redis.setup = Promise.withResolvers<void>();
    redis.createRedisStreamClient.mockImplementation(
      async ({ origin }: { origin: string }) =>
        origin === "conversation_events"
          ? redis.subscriptionClient
          : redis.streamClient
    );
    redis.streamClient.xRead.mockReset().mockResolvedValue(null);
    redis.subscriptionClient.subscribe.mockImplementation(
      () => redis.setup.promise
    );
    redis.subscriptionClient.unsubscribe.mockResolvedValue(undefined);
    vi.clearAllMocks();
  });

  it("keeps a pending subscriber when a concurrent caller aborts", async () => {
    const manager = getRedisHybridManager();
    const callback = vi.fn();
    const firstSubscription = manager.subscribe(
      "message-msg_1",
      callback,
      "message_events_long_poll"
    );
    await vi.waitFor(() =>
      expect(redis.subscriptionClient.subscribe).toHaveBeenCalledOnce()
    );

    const controller = new AbortController();
    controller.abort();
    await expect(
      manager.subscribe("message-msg_1", vi.fn(), "message_events_long_poll", {
        signal: controller.signal,
      })
    ).resolves.toEqual({ history: [], unsubscribe: expect.any(Function) });

    expect(redis.subscriptionClient.subscribe).toHaveBeenCalledOnce();
    expect(redis.subscriptionClient.unsubscribe).not.toHaveBeenCalled();

    redis.setup.resolve();
    const subscription = await firstSubscription;
    expect(subscription.history).toEqual([]);

    subscription.unsubscribe();
    await vi.waitFor(() =>
      expect(redis.subscriptionClient.unsubscribe).toHaveBeenCalledOnce()
    );
    expect(callback).toHaveBeenCalledWith("close");
  });

  it("releases an aborted channel after its pending setup settles", async () => {
    const manager = getRedisHybridManager();
    const controller = new AbortController();
    const subscription = manager.subscribe(
      "message-msg_2",
      vi.fn(),
      "message_events_long_poll",
      { signal: controller.signal }
    );
    await vi.waitFor(() =>
      expect(redis.subscriptionClient.subscribe).toHaveBeenCalledOnce()
    );

    controller.abort();
    expect(redis.subscriptionClient.unsubscribe).not.toHaveBeenCalled();

    redis.setup.resolve();
    await expect(subscription).resolves.toEqual({
      history: [],
      unsubscribe: expect.any(Function),
    });
    await vi.waitFor(() =>
      expect(redis.subscriptionClient.unsubscribe).toHaveBeenCalledOnce()
    );
  });

  it("finishes paginated history before including newer live events in a poll", async () => {
    const events = Array.from({ length: 101 }, (_, index) => ({
      id: `${index + 1}-0`,
      message: { payload: JSON.stringify({ index }) },
    }));
    const firstPage =
      Promise.withResolvers<
        Array<{ name: string; messages: EventPayload[] }>
      >();
    let publish: (event: EventPayload) => void = () => undefined;
    redis.subscriptionClient.subscribe.mockImplementation(
      async (
        channel: string,
        onMessage: (message: string, channel: string) => void
      ) => {
        publish = (event) => onMessage(JSON.stringify(event), channel);
      }
    );
    redis.streamClient.xRead
      .mockImplementationOnce(() => firstPage.promise)
      .mockResolvedValueOnce([
        { name: "history", messages: events.slice(50, 100) },
      ])
      .mockResolvedValueOnce([
        { name: "history", messages: events.slice(100) },
      ]);
    const controller = new AbortController();
    const read = (lastEventId: string | null) =>
      getRedisEventsBatch({
        channel: "pagination-handoff",
        origin: "message_events_long_poll",
        lastEventId,
        signal: controller.signal,
      });
    const pending = read(null);
    await vi.waitFor(() => expect(redis.streamClient.xRead).toHaveBeenCalled());
    publish(events[100]);
    firstPage.resolve([{ name: "history", messages: events.slice(0, 50) }]);
    const first = await pending;
    expect(first.map((event) => event.id)).toEqual(
      events.slice(0, 50).map((event) => event.id)
    );
    const second = await read(first.at(-1)?.id ?? null);
    const third = await read(second.at(-1)?.id ?? null);
    expect([...first, ...second, ...third]).toEqual(events);
  });
  it("does not deliver history again when its pub/sub notification arrives late", async () => {
    const history = { id: "3-0", message: { payload: "history" } };
    const live = { id: "4-0", message: { payload: "live" } };
    let publish: (event: EventPayload) => void = () => undefined;
    redis.subscriptionClient.subscribe.mockImplementation(
      async (
        channel: string,
        onMessage: (message: string, channel: string) => void
      ) => {
        publish = (event) => onMessage(JSON.stringify(event), channel);
      }
    );
    redis.streamClient.xRead.mockResolvedValue([
      { name: "history", messages: [history] },
    ]);
    const callback = vi.fn();
    const subscription = await getRedisHybridManager().subscribe(
      "late-history-notification",
      callback,
      "message_events",
      { lastEventId: "2-0" }
    );
    try {
      expect(subscription.history).toEqual([history]);
      publish({ id: "2-0", message: { payload: "previous poll" } });
      publish(history);
      publish(live);
      expect(callback.mock.calls).toEqual([[live]]);
    } finally {
      subscription.unsubscribe();
    }
  });
  it.each([
    "reversed",
    "delayed",
  ])("returns stream order and resumes without replay when notifications are %s", async (notificationOrder) => {
    const first = { id: "1-0", message: { payload: "first" } };
    const second = { id: "2-0", message: { payload: "second" } };
    const third = { id: "3-0", message: { payload: "third" } };
    const initialRead = Promise.withResolvers<null>();
    let publish: (event: EventPayload) => void = () => undefined;
    redis.subscriptionClient.subscribe.mockImplementation(
      async (
        channel: string,
        onMessage: (message: string, channel: string) => void
      ) => {
        publish = (event) => onMessage(JSON.stringify(event), channel);
      }
    );
    const persisted = [first, second];
    redis.streamClient.xRead
      .mockImplementationOnce(() => initialRead.promise)
      .mockImplementation(async (_options, { id }: { id: string }) => [
        {
          name: "history",
          messages: persisted.filter(
            (event) =>
              event.id.localeCompare(id, undefined, { numeric: true }) > 0
          ),
        },
      ]);
    const read = (lastEventId: string | null) =>
      getRedisEventsBatch({
        channel: `out-of-order-${notificationOrder}`,
        origin: "message_events_long_poll",
        lastEventId,
        signal: new AbortController().signal,
      });

    const pending = read(null);
    await vi.waitFor(() => expect(redis.streamClient.xRead).toHaveBeenCalled());
    initialRead.resolve(null);
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    publish(second);
    if (notificationOrder === "reversed") {
      publish(first);
    }

    const batch = await pending;
    expect(batch).toEqual([first, second]);
    persisted.push(third);
    const next = read(batch.at(-1)?.id ?? null);
    await vi.waitFor(() =>
      expect(redis.subscriptionClient.subscribe).toHaveBeenCalledTimes(2)
    );
    publish(first);
    expect(await next).toEqual([third]);
    expect(redis.streamClient.xRead).toHaveBeenLastCalledWith(
      expect.anything(),
      { key: `stream:out-of-order-${notificationOrder}`, id: "2-0" },
      { COUNT: 50 }
    );
  });
  it("releases a poll subscription when reading awakened events fails", async () => {
    const failure = new Error("Redis history unavailable");
    redis.subscriptionClient.subscribe.mockImplementation(
      async (
        channel: string,
        onMessage: (message: string, channel: string) => void
      ) => {
        await Promise.resolve();
        onMessage(
          JSON.stringify({ id: "2-0", message: { payload: "wake" } }),
          channel
        );
      }
    );
    redis.streamClient.xRead
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(failure);
    const pending = getRedisEventsBatch({
      channel: "failed-poll-reread",
      origin: "message_events_long_poll",
      lastEventId: null,
      signal: new AbortController().signal,
    });
    await expect(pending).rejects.toBe(failure);
    await vi.waitFor(() =>
      expect(redis.subscriptionClient.unsubscribe).toHaveBeenCalledOnce()
    );
  });
  it("releases its subscription instead of treating a failed history read as empty", async () => {
    const failure = new Error("Redis history unavailable");
    redis.setup.resolve();
    redis.streamClient.xRead.mockRejectedValueOnce(failure);
    const callback = vi.fn();
    await expect(
      getRedisHybridManager().subscribe(
        "failed-history",
        callback,
        "message_events",
        { lastEventId: "2-0" }
      )
    ).rejects.toBe(failure);
    await vi.waitFor(() =>
      expect(redis.subscriptionClient.unsubscribe).toHaveBeenCalledOnce()
    );
    expect(callback).not.toHaveBeenCalled();
  });
});
