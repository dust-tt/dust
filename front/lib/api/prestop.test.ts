import { DEFAULT_PRESTOP_DRAIN_DURATION_MS } from "@app/lib/constants/timeouts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { childLogger, statsDClient } = vi.hoisted(() => ({
  childLogger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
  statsDClient: {
    distribution: vi.fn(),
    gauge: vi.fn(),
    increment: vi.fn(),
  },
}));

vi.mock("@app/lib/utils/statsd", () => ({
  statsDMetrics: statsDClient,
}));

vi.mock("@app/logger/logger", () => ({
  default: {
    child: () => childLogger,
  },
}));

describe("runPreStop", () => {
  let runPreStop: typeof import("@app/lib/api/prestop").runPreStop;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.clearAllMocks();
    vi.resetModules();
    global.wakeLocks = new Map();
    delete process.env.PRESTOP_DRAIN_DURATION_SECONDS;
    ({ runPreStop } = await import("@app/lib/api/prestop"));
  });

  afterEach(() => {
    global.wakeLocks = undefined;
    delete process.env.PRESTOP_DRAIN_DURATION_SECONDS;
    vi.useRealTimers();
  });

  it("keeps the hook open for the complete drain window", async () => {
    let completed = false;
    const preStopPromise = runPreStop().then(() => {
      completed = true;
    });

    await vi.advanceTimersByTimeAsync(DEFAULT_PRESTOP_DRAIN_DURATION_MS - 1);
    expect(completed).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await preStopPromise;

    expect(completed).toBe(true);
    expect(statsDClient.distribution).toHaveBeenCalledWith(
      "prestop.total_duration_ms",
      DEFAULT_PRESTOP_DRAIN_DURATION_MS
    );
    expect(statsDClient.increment).toHaveBeenCalledWith(
      "prestop.wake_locks_cleared"
    );
  });

  it("finishes at the drain deadline when a wake lock remains active", async () => {
    global.wakeLocks?.set("active-lock", {
      id: "active-lock",
      startTime: 0,
      context: { operation: "test" },
    });

    const preStopPromise = runPreStop();
    await vi.advanceTimersByTimeAsync(DEFAULT_PRESTOP_DRAIN_DURATION_MS);
    await preStopPromise;

    expect(statsDClient.increment).toHaveBeenCalledWith("prestop.timeouts");
    expect(statsDClient.gauge).toHaveBeenCalledWith(
      "prestop.timeout_wake_locks",
      1
    );
    expect(childLogger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        totalDurationMs: DEFAULT_PRESTOP_DRAIN_DURATION_MS,
      }),
      "Endpoint drain deadline reached with active wake locks"
    );
  });

  it("uses the deployment-specific drain duration", async () => {
    process.env.PRESTOP_DRAIN_DURATION_SECONDS = "180";
    let completed = false;
    const preStopPromise = runPreStop().then(() => {
      completed = true;
    });

    await vi.advanceTimersByTimeAsync(120_000);
    expect(completed).toBe(false);

    await vi.advanceTimersByTimeAsync(60_000);
    await preStopPromise;
    expect(completed).toBe(true);
  });

  it("shares one drain deadline across duplicate calls", async () => {
    const firstPreStopPromise = runPreStop();
    await vi.advanceTimersByTimeAsync(30_000);

    const duplicatePreStopPromise = runPreStop();
    expect(duplicatePreStopPromise).toBe(firstPreStopPromise);

    await vi.advanceTimersByTimeAsync(90_000);
    await Promise.all([firstPreStopPromise, duplicatePreStopPromise]);
    expect(
      statsDClient.increment.mock.calls.filter(
        ([metricName]) => metricName === "prestop.requests"
      )
    ).toHaveLength(1);
  });
});
