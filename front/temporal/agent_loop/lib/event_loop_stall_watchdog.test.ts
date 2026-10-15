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

function makeInterceptor(workflowId: string, activityId: string) {
  return new StallTrackingActivityInterceptor({
    info: {
      activityType: "runToolActivity",
      activityId,
      workflowExecution: { workflowId, runId: "run" },
    },
  } as unknown as Context);
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
    const runningPromise = makeInterceptor("wf-running", "1").execute(
      {} as ActivityExecuteInput,
      () => running.promise
    );
    const finishingPromise = makeInterceptor("wf-finishing", "2").execute(
      {} as ActivityExecuteInput,
      () => finishing.promise
    );
    annotateInFlightActivity(
      { workflowId: "wf-running", activityId: "1" },
      { toolName: "slow_tool" }
    );

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

  it("does not report when the event loop keeps up", async () => {
    await vi.advanceTimersByTimeAsync(10_000);

    expect(warn).not.toHaveBeenCalled();
  });
});
