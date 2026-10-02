import { pollEvents } from "@front-api/lib/api/sse/poll_events";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => vi.useRealTimers());

describe("poll request lifecycle", () => {
  it("bounds idle polling and releases the timeout", async () => {
    vi.useFakeTimers();
    let readerSignal: AbortSignal | undefined;
    const app = new Hono();
    app.get("/", (ctx) =>
      pollEvents(ctx, (signal) => {
        readerSignal = signal;
        return new Promise((resolve) =>
          signal.addEventListener("abort", () => resolve({ events: [] }), {
            once: true,
          })
        );
      })
    );
    const pending = app.request("/");
    await vi.advanceTimersByTimeAsync(25_000);
    const response = await pending;
    expect(readerSignal?.aborted).toBe(true);
    expect(await response.json()).toEqual({ events: [] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("passes cancellation through even when the request was already aborted", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    controller.abort();
    const app = new Hono();
    const reader = vi.fn(async (signal: AbortSignal) => {
      expect(signal.aborted).toBe(true);
      return { events: [] };
    });
    app.get("/", (ctx) => pollEvents(ctx, reader));
    const response = await app.request(
      new Request("http://localhost/", { signal: controller.signal })
    );
    expect(response.status).toBe(200);
    expect(reader).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });
});
