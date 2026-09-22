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
    redis.streamClient.xRead.mockResolvedValue(null);
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
});
