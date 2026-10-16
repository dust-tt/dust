import type { Info } from "@temporalio/activity";
import type { ActivityExecuteInput } from "@temporalio/worker";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const EXECUTE_INPUT: ActivityExecuteInput = { args: [], headers: {} };

function makeInfo(workflowId: string, activityId: string, attempt = 1): Info {
  return {
    taskToken: new Uint8Array(),
    base64TaskToken: "",
    activityId,
    activityType: "runToolActivity",
    activityNamespace: "default",
    attempt,
    isLocal: false,
    workflowExecution: { workflowId, runId: "run" },
    workflowNamespace: "default",
    workflowType: "agentLoopWorkflow",
    scheduledTimestampMs: 0,
    scheduleToCloseTimeoutMs: 0,
    startToCloseTimeoutMs: 0,
    currentAttemptScheduledTimestampMs: 0,
    heartbeatDetails: undefined,
    taskQueue: "agent-loop",
  };
}

function makeDeferred() {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

describe("startEventLoopStallWatchdog", () => {
  let watchdog: typeof import("@app/temporal/agent_loop/lib/event_loop_stall_watchdog");
  let warn: ReturnType<typeof vi.spyOn>;
  let performanceOffsetMs: number;

  // Simulates a blocked event loop: monotonic time jumps without the interval firing.
  const simulateStall = () => {
    performanceOffsetMs += watchdog.EVENT_LOOP_STALL_THRESHOLD_MS + 2_000;
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    performanceOffsetMs = 0;
    const now = performance.now.bind(performance);
    vi.spyOn(performance, "now").mockImplementation(
      () => now() + performanceOffsetMs
    );
    // The watchdog is a process-wide singleton: load a fresh module for each test.
    vi.resetModules();
    const { default: logger } = await import("@app/logger/logger");
    warn = vi.spyOn(logger, "warn").mockImplementation(() => undefined);
    watchdog =
      await import("@app/temporal/agent_loop/lib/event_loop_stall_watchdog");
    watchdog.startEventLoopStallWatchdog();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("reports in-flight and completed activities after a stall", async () => {
    const running = makeDeferred();
    const finishing = makeDeferred();
    const runningInfo = makeInfo("wf-running", "1");
    const runningPromise = new watchdog.StallTrackingActivityInterceptor(
      runningInfo
    ).execute(EXECUTE_INPUT, () => running.promise);
    const finishingPromise = new watchdog.StallTrackingActivityInterceptor(
      makeInfo("wf-finishing", "2")
    ).execute(EXECUTE_INPUT, () => finishing.promise);
    watchdog.annotateInFlightActivity(runningInfo, { toolName: "slow_tool" });

    simulateStall();
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
    const timedOutPromise = new watchdog.StallTrackingActivityInterceptor(
      makeInfo("wf", "1", 1)
    ).execute(EXECUTE_INPUT, () => timedOut.promise);
    const retryPromise = new watchdog.StallTrackingActivityInterceptor(
      makeInfo("wf", "1", 2)
    ).execute(EXECUTE_INPUT, () => retry.promise);

    timedOut.resolve();
    await timedOutPromise;
    await vi.advanceTimersByTimeAsync(1_000);
    simulateStall();
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
    watchdog.startEventLoopStallWatchdog();

    simulateStall();
    await vi.advanceTimersByTimeAsync(1_000);

    expect(warn).toHaveBeenCalledTimes(1);
  });

  it("does not report when the event loop keeps up", async () => {
    await vi.advanceTimersByTimeAsync(10_000);

    expect(warn).not.toHaveBeenCalled();
  });
});
