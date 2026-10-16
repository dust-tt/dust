import logger from "@app/logger/logger";
import {
  annotateInFlightActivity,
  EVENT_LOOP_STALL_THRESHOLD_MS,
  StallTrackingActivityInterceptor,
  startEventLoopStallWatchdog,
} from "@app/temporal/agent_loop/lib/event_loop_stall_watchdog";
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
    const runningInfo = makeInfo("wf-running", "1");
    const runningPromise = new StallTrackingActivityInterceptor(
      runningInfo
    ).execute(EXECUTE_INPUT, () => running.promise);
    const finishingPromise = new StallTrackingActivityInterceptor(
      makeInfo("wf-finishing", "2")
    ).execute(EXECUTE_INPUT, () => finishing.promise);
    annotateInFlightActivity(runningInfo, { toolName: "slow_tool" });

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
      makeInfo("wf", "1", 1)
    ).execute(EXECUTE_INPUT, () => timedOut.promise);
    const retryPromise = new StallTrackingActivityInterceptor(
      makeInfo("wf", "1", 2)
    ).execute(EXECUTE_INPUT, () => retry.promise);

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
