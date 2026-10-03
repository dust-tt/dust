import { getRedisEventsBatch } from "@app/lib/api/redis_events_batch";
import type { EventPayload } from "@app/lib/api/redis-hybrid-manager";
import { afterEach, describe, expect, it, vi } from "vitest";

const { subscribe, readEventsAfter } = vi.hoisted(() => ({
  subscribe: vi.fn(),
  readEventsAfter: vi.fn(),
}));
vi.mock("@app/lib/api/redis-hybrid-manager", () => ({
  getRedisHybridManager: () => ({ subscribe, readEventsAfter }),
}));
afterEach(() => {
  vi.useRealTimers();
  subscribe.mockReset();
  readEventsAfter.mockReset();
});

describe("getRedisEventsBatch", () => {
  it("releases the live batch timer when the request aborts", async () => {
    vi.useFakeTimers();
    const event: EventPayload = { id: "1-0", message: { payload: "event" } };
    const unsubscribe = vi.fn();
    subscribe.mockImplementation(async (_channel, onEvent) => {
      onEvent(event);
      return { history: [], unsubscribe };
    });
    readEventsAfter.mockResolvedValue([]);
    const controller = new AbortController();
    const pending = getRedisEventsBatch({
      channel: "test",
      origin: "test",
      lastEventId: null,
      signal: controller.signal,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBe(1);
    controller.abort();
    await expect(pending).resolves.toEqual([]);
    expect(unsubscribe).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
