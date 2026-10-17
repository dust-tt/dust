import type { HistoryEvent } from "@app/lib/api/actions/servers/temporal/history";
import { summarizeHistory } from "@app/lib/api/actions/servers/temporal/history";
import { describe, expect, it } from "vitest";

const BASE_SECONDS = 1_800_000_000;

// Protobuf `Long` fields are read through `Number()`, so plain numbers stand in for them here.
function event(fields: Record<string, unknown>): HistoryEvent {
  return fields as HistoryEvent;
}

function at(offsetMs: number) {
  return {
    seconds: BASE_SECONDS + Math.floor(offsetMs / 1000),
    nanos: (offsetMs % 1000) * 1e6,
  };
}

function scheduled(
  eventId: number,
  offsetMs: number,
  activityType: string
): HistoryEvent {
  return event({
    eventId,
    eventTime: at(offsetMs),
    activityTaskScheduledEventAttributes: {
      activityId: `${eventId}`,
      activityType: { name: activityType },
    },
  });
}

function started(
  eventId: number,
  offsetMs: number,
  scheduledEventId: number,
  attempt: number
): HistoryEvent {
  return event({
    eventId,
    eventTime: at(offsetMs),
    activityTaskStartedEventAttributes: { scheduledEventId, attempt },
  });
}

describe("summarizeHistory", () => {
  it("computes per activity type outcomes and durations from out-of-order events", () => {
    const events: HistoryEvent[] = [
      event({
        eventId: 9,
        eventTime: at(9000),
        activityTaskFailedEventAttributes: {
          scheduledEventId: 7,
          failure: {
            message: "boom",
            applicationFailureInfo: { type: "TimeoutError" },
          },
        },
      }),
      started(8, 4000, 7, 3),
      scheduled(7, 3000, "runModel"),
      event({
        eventId: 6,
        eventTime: at(2500),
        activityTaskCompletedEventAttributes: { scheduledEventId: 4 },
      }),
      started(5, 1500, 4, 1),
      scheduled(4, 1000, "runModel"),
      event({
        eventId: 3,
        eventTime: at(500),
        workflowTaskCompletedEventAttributes: {},
      }),
      event({
        eventId: 1,
        eventTime: at(0),
        workflowExecutionStartedEventAttributes: {
          workflowType: { name: "agentLoopWorkflow" },
        },
      }),
    ];

    const summary = summarizeHistory(events, { includePayloads: false });

    expect(summary.timeline.map((e) => e.eventId)).toEqual([
      1, 4, 5, 6, 7, 8, 9,
    ]);
    expect(summary.omittedEventCount).toBe(1);
    expect(summary.activityStats).toEqual([
      {
        activityType: "runModel",
        scheduled: 2,
        completed: 1,
        failed: 1,
        timedOut: 0,
        canceled: 0,
        notClosed: 0,
        maxAttempt: 3,
        scheduleToStart: { count: 2, p50Ms: 1000, p95Ms: 1000, maxMs: 1000 },
        startToClose: { count: 2, p50Ms: 5000, p95Ms: 5000, maxMs: 5000 },
      },
    ]);
    expect(summary.timeline.at(-1)).toMatchObject({
      kind: "activity_failed",
      failure: { message: "boom", type: "TimeoutError" },
    });
  });

  it("counts activities without a close event in the read window as not closed", () => {
    const summary = summarizeHistory(
      [scheduled(1, 0, "syncFiles"), started(2, 200, 1, 1)],
      { includePayloads: false }
    );

    expect(summary.activityStats[0]).toMatchObject({
      activityType: "syncFiles",
      notClosed: 1,
      startToClose: null,
      scheduleToStart: { count: 1, maxMs: 200 },
    });
  });
});
