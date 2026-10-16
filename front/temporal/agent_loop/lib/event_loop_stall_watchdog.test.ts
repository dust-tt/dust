import logger from "@app/logger/logger";
import {
  annotateInFlightActivity,
  EVENT_LOOP_STALL_THRESHOLD_MS,
  StallTrackingActivityInterceptor,
  startEventLoopStallWatchdog,
} from "@app/temporal/agent_loop/lib/event_loop_stall_watchdog";
import type { Context } from "@temporalio/activity";
import type { ActivityExecuteInput } from "@temporalio/worker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeContext(workflowId: string, activityId: string, attempt = 1) {
  return {
    info: {
      activityType: "runToolActivity",
      activityId,
      attempt,
      workflowExecution: { workflowId, runId: "run" },
    },
  } as unknown as Context;
}

function makeDeferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("startEventLoopStallWatchdog", () => {
  let stopWatchdog: () => void;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    stopWatchdog = startEventLoopStallWatchdog();
  });

  afterEach(() => {
    stopWatchdog();
    warn.mockRestore();
    vi.useRealTimers();
  });

  it("reports in-flight and completed activities after a stall", async () => {
    const running = makeDeferred();
    const finishing = makeDeferred();
    const runningContext = makeContext("wf-running", "1");
    const runningPromise = new StallTrackingActivityInterceptor(
      runningContext
    ).execute({} as ActivityExecuteInput, () => running.promise);
    const finishingPromise = new StallTrackingActivityInterceptor(
      makeContext("wf-finishing", "2")
    ).execute({} as ActivityExecuteInput, () => finishing.promise);
    annotateInFlightActivity(runningContext, { toolName: "slow_tool" });

    // Simulate a blocked event loop: wall time jumps without the interval firing.
    vi.setSystemTime(Date.now() + EVENT_LOOP_STALL_THRESHOLD_MS + 2_000);
    finishing.resolve();
    await finishingPromise;
    await vi.advanceTimersByTimeAsync(1_000);

    expect(warn).toHaveBeenCalledTimes(1);
    const [payload, message] = warn.mock.calls[0];
    expect(message).toBe("Event loop stalled");
    expect(payload).toMatchObject({
      inFlightActivities: [
        { workflowId: "wf-running", activityId: "1", toolName: "slow_tool" },
      ],
      activitiesCompletedDuringStall: [
        { workflowId: "wf-finishing", activityId: "2" },
      ],
    });

    running.resolve();
    await runningPromise;
  });

  it("keeps tracking a retry after its timed-out attempt completes", async () => {
    const timedOut = makeDeferred();
    const retry = makeDeferred();
    const timedOutPromise = new StallTrackingActivityInterceptor(
      makeContext("wf", "1", 1)
    ).execute({} as ActivityExecuteInput, () => timedOut.promise);
    const retryPromise = new StallTrackingActivityInterceptor(
      makeContext("wf", "1", 2)
    ).execute({} as ActivityExecuteInput, () => retry.promise);

    timedOut.resolve();
    await timedOutPromise;
    await vi.advanceTimersByTimeAsync(1_000);
    vi.setSystemTime(Date.now() + EVENT_LOOP_STALL_THRESHOLD_MS + 2_000);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatchObject({
      inFlightActivities: [{ workflowId: "wf", activityId: "1", attempt: 2 }],
      activitiesCompletedDuringStall: [],
    });

    retry.resolve();
    await retryPromise;
  });

  it("runs a single watchdog per process", async () => {
    const stopSecondWatchdog = startEventLoopStallWatchdog();

    vi.setSystemTime(Date.now() + EVENT_LOOP_STALL_THRESHOLD_MS + 2_000);
    await vi.advanceTimersByTimeAsync(1_000);

    expect(stopSecondWatchdog).toBe(stopWatchdog);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not report when the event loop keeps up", async () => {
    await vi.advanceTimersByTimeAsync(10_000);

    expect(warn).not.toHaveBeenCalled();
  });
});
