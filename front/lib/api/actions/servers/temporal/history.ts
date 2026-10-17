import {
  decodePayloads,
  protoTimeToIso,
  protoTimeToMs,
  summarizeFailure,
} from "@app/lib/api/actions/servers/temporal/helpers";
import type { Client } from "@temporalio/client";

export type HistoryEvent = NonNullable<
  NonNullable<
    Awaited<
      ReturnType<Client["workflowService"]["getWorkflowExecutionHistory"]>
    >["history"]
  >["events"]
>[number];

type TimelineEvent = {
  eventId: number;
  time: string | null;
  kind: string;
} & Record<string, unknown>;

type ActivityOutcome = "completed" | "failed" | "timed_out" | "canceled";

type ActivityExecution = {
  activityType: string;
  scheduledMs: number | null;
  startedMs: number | null;
  closedMs: number | null;
  attempt: number | null;
  outcome: ActivityOutcome | null;
};

type DurationStats = {
  count: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
};

function computeDurationStats(durationsMs: number[]): DurationStats | null {
  if (durationsMs.length === 0) {
    return null;
  }
  const sorted = [...durationsMs].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return {
    count: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
    maxMs: sorted[sorted.length - 1],
  };
}

function toTimelineEvent(
  event: HistoryEvent,
  includePayloads: boolean
): TimelineEvent | null {
  const base = {
    eventId: Number(event.eventId ?? 0),
    time: protoTimeToIso(event.eventTime),
  };
  const payloads = (p: Parameters<typeof decodePayloads>[0]) =>
    includePayloads ? decodePayloads(p) : undefined;

  if (event.workflowExecutionStartedEventAttributes) {
    const a = event.workflowExecutionStartedEventAttributes;
    return {
      ...base,
      kind: "workflow_started",
      workflowType: a.workflowType?.name ?? null,
      taskQueue: a.taskQueue?.name ?? null,
      attempt: a.attempt ?? null,
      parentWorkflowId: a.parentWorkflowExecution?.workflowId ?? null,
      continuedFromRunId: a.continuedExecutionRunId || null,
      workflowRunTimeoutMs: protoTimeToMs(a.workflowRunTimeout),
      input: payloads(a.input),
    };
  }
  if (event.workflowExecutionCompletedEventAttributes) {
    return {
      ...base,
      kind: "workflow_completed",
      result: payloads(event.workflowExecutionCompletedEventAttributes.result),
    };
  }
  if (event.workflowExecutionFailedEventAttributes) {
    return {
      ...base,
      kind: "workflow_failed",
      failure: summarizeFailure(
        event.workflowExecutionFailedEventAttributes.failure
      ),
    };
  }
  if (event.workflowExecutionTimedOutEventAttributes) {
    return { ...base, kind: "workflow_timed_out" };
  }
  if (event.workflowExecutionTerminatedEventAttributes) {
    const a = event.workflowExecutionTerminatedEventAttributes;
    return {
      ...base,
      kind: "workflow_terminated",
      reason: a.reason ?? null,
      identity: a.identity ?? null,
    };
  }
  if (event.workflowExecutionCancelRequestedEventAttributes) {
    const a = event.workflowExecutionCancelRequestedEventAttributes;
    return {
      ...base,
      kind: "workflow_cancel_requested",
      cause: a.cause ?? null,
      identity: a.identity ?? null,
    };
  }
  if (event.workflowExecutionCanceledEventAttributes) {
    return { ...base, kind: "workflow_canceled" };
  }
  if (event.workflowExecutionContinuedAsNewEventAttributes) {
    return {
      ...base,
      kind: "workflow_continued_as_new",
      newRunId:
        event.workflowExecutionContinuedAsNewEventAttributes
          .newExecutionRunId ?? null,
    };
  }
  if (event.workflowTaskFailedEventAttributes) {
    const a = event.workflowTaskFailedEventAttributes;
    return {
      ...base,
      kind: "workflow_task_failed",
      cause: a.cause ?? null,
      failure: summarizeFailure(a.failure),
      identity: a.identity ?? null,
    };
  }
  if (event.workflowTaskTimedOutEventAttributes) {
    return { ...base, kind: "workflow_task_timed_out" };
  }
  if (event.activityTaskScheduledEventAttributes) {
    const a = event.activityTaskScheduledEventAttributes;
    return {
      ...base,
      kind: "activity_scheduled",
      activityId: a.activityId ?? null,
      activityType: a.activityType?.name ?? null,
      taskQueue: a.taskQueue?.name ?? null,
      startToCloseTimeoutMs: protoTimeToMs(a.startToCloseTimeout),
      scheduleToCloseTimeoutMs: protoTimeToMs(a.scheduleToCloseTimeout),
      heartbeatTimeoutMs: protoTimeToMs(a.heartbeatTimeout),
      maximumAttempts: a.retryPolicy?.maximumAttempts ?? null,
      input: payloads(a.input),
    };
  }
  if (event.activityTaskStartedEventAttributes) {
    const a = event.activityTaskStartedEventAttributes;
    return {
      ...base,
      kind: "activity_started",
      scheduledEventId: Number(a.scheduledEventId ?? 0),
      attempt: a.attempt ?? null,
      identity: a.identity ?? null,
      lastFailure: summarizeFailure(a.lastFailure),
    };
  }
  if (event.activityTaskCompletedEventAttributes) {
    const a = event.activityTaskCompletedEventAttributes;
    return {
      ...base,
      kind: "activity_completed",
      scheduledEventId: Number(a.scheduledEventId ?? 0),
      result: payloads(a.result),
    };
  }
  if (event.activityTaskFailedEventAttributes) {
    const a = event.activityTaskFailedEventAttributes;
    return {
      ...base,
      kind: "activity_failed",
      scheduledEventId: Number(a.scheduledEventId ?? 0),
      failure: summarizeFailure(a.failure),
    };
  }
  if (event.activityTaskTimedOutEventAttributes) {
    const a = event.activityTaskTimedOutEventAttributes;
    return {
      ...base,
      kind: "activity_timed_out",
      scheduledEventId: Number(a.scheduledEventId ?? 0),
      failure: summarizeFailure(a.failure),
    };
  }
  if (event.activityTaskCancelRequestedEventAttributes) {
    return {
      ...base,
      kind: "activity_cancel_requested",
      scheduledEventId: Number(
        event.activityTaskCancelRequestedEventAttributes.scheduledEventId ?? 0
      ),
    };
  }
  if (event.activityTaskCanceledEventAttributes) {
    return {
      ...base,
      kind: "activity_canceled",
      scheduledEventId: Number(
        event.activityTaskCanceledEventAttributes.scheduledEventId ?? 0
      ),
    };
  }
  if (event.timerStartedEventAttributes) {
    const a = event.timerStartedEventAttributes;
    return {
      ...base,
      kind: "timer_started",
      timerId: a.timerId ?? null,
      startToFireTimeoutMs: protoTimeToMs(a.startToFireTimeout),
    };
  }
  if (event.timerFiredEventAttributes) {
    return {
      ...base,
      kind: "timer_fired",
      timerId: event.timerFiredEventAttributes.timerId ?? null,
    };
  }
  if (event.timerCanceledEventAttributes) {
    return {
      ...base,
      kind: "timer_canceled",
      timerId: event.timerCanceledEventAttributes.timerId ?? null,
    };
  }
  if (event.markerRecordedEventAttributes) {
    return {
      ...base,
      kind: "marker_recorded",
      markerName: event.markerRecordedEventAttributes.markerName ?? null,
      failure: summarizeFailure(event.markerRecordedEventAttributes.failure),
    };
  }
  if (event.workflowExecutionSignaledEventAttributes) {
    const a = event.workflowExecutionSignaledEventAttributes;
    return {
      ...base,
      kind: "signal_received",
      signalName: a.signalName ?? null,
      identity: a.identity ?? null,
      input: payloads(a.input),
    };
  }
  if (event.startChildWorkflowExecutionInitiatedEventAttributes) {
    const a = event.startChildWorkflowExecutionInitiatedEventAttributes;
    return {
      ...base,
      kind: "child_workflow_initiated",
      workflowId: a.workflowId ?? null,
      workflowType: a.workflowType?.name ?? null,
      taskQueue: a.taskQueue?.name ?? null,
    };
  }
  if (event.startChildWorkflowExecutionFailedEventAttributes) {
    const a = event.startChildWorkflowExecutionFailedEventAttributes;
    return {
      ...base,
      kind: "child_workflow_start_failed",
      workflowId: a.workflowId ?? null,
      cause: a.cause ?? null,
    };
  }
  if (event.childWorkflowExecutionStartedEventAttributes) {
    const a = event.childWorkflowExecutionStartedEventAttributes;
    return {
      ...base,
      kind: "child_workflow_started",
      workflowId: a.workflowExecution?.workflowId ?? null,
      runId: a.workflowExecution?.runId ?? null,
    };
  }
  if (event.childWorkflowExecutionCompletedEventAttributes) {
    return {
      ...base,
      kind: "child_workflow_completed",
      workflowId:
        event.childWorkflowExecutionCompletedEventAttributes.workflowExecution
          ?.workflowId ?? null,
    };
  }
  if (event.childWorkflowExecutionFailedEventAttributes) {
    const a = event.childWorkflowExecutionFailedEventAttributes;
    return {
      ...base,
      kind: "child_workflow_failed",
      workflowId: a.workflowExecution?.workflowId ?? null,
      failure: summarizeFailure(a.failure),
    };
  }
  if (event.childWorkflowExecutionTimedOutEventAttributes) {
    return {
      ...base,
      kind: "child_workflow_timed_out",
      workflowId:
        event.childWorkflowExecutionTimedOutEventAttributes.workflowExecution
          ?.workflowId ?? null,
    };
  }
  if (event.childWorkflowExecutionCanceledEventAttributes) {
    return {
      ...base,
      kind: "child_workflow_canceled",
      workflowId:
        event.childWorkflowExecutionCanceledEventAttributes.workflowExecution
          ?.workflowId ?? null,
    };
  }
  if (event.childWorkflowExecutionTerminatedEventAttributes) {
    return {
      ...base,
      kind: "child_workflow_terminated",
      workflowId:
        event.childWorkflowExecutionTerminatedEventAttributes.workflowExecution
          ?.workflowId ?? null,
    };
  }
  // Successful workflow task scheduled/started/completed events and other bookkeeping events are
  // left out of the timeline: they are counted in `omittedEventCount` instead.
  return null;
}

function getActivityClose(
  event: HistoryEvent
): { scheduledEventId: number; outcome: ActivityOutcome } | null {
  const toClose = (
    attributes: { scheduledEventId?: unknown } | null | undefined,
    outcome: ActivityOutcome
  ) =>
    attributes
      ? { scheduledEventId: Number(attributes.scheduledEventId ?? 0), outcome }
      : null;

  return (
    toClose(event.activityTaskCompletedEventAttributes, "completed") ??
    toClose(event.activityTaskFailedEventAttributes, "failed") ??
    toClose(event.activityTaskTimedOutEventAttributes, "timed_out") ??
    toClose(event.activityTaskCanceledEventAttributes, "canceled")
  );
}

export function summarizeHistory(
  events: HistoryEvent[],
  { includePayloads }: { includePayloads: boolean }
) {
  const chronologicalEvents = [...events].sort(
    (a, b) => Number(a.eventId ?? 0) - Number(b.eventId ?? 0)
  );

  const timeline: TimelineEvent[] = [];
  const executionsByScheduledEventId = new Map<number, ActivityExecution>();
  let workflowTaskFailureCount = 0;

  for (const event of chronologicalEvents) {
    const timelineEvent = toTimelineEvent(event, includePayloads);
    if (timelineEvent) {
      timeline.push(timelineEvent);
    }

    const eventMs = protoTimeToMs(event.eventTime);
    if (
      event.workflowTaskFailedEventAttributes ||
      event.workflowTaskTimedOutEventAttributes
    ) {
      workflowTaskFailureCount++;
    }

    const scheduled = event.activityTaskScheduledEventAttributes;
    if (scheduled) {
      executionsByScheduledEventId.set(Number(event.eventId ?? 0), {
        activityType: scheduled.activityType?.name ?? "unknown",
        scheduledMs: eventMs,
        startedMs: null,
        closedMs: null,
        attempt: null,
        outcome: null,
      });
      continue;
    }

    const started = event.activityTaskStartedEventAttributes;
    if (started) {
      const execution = executionsByScheduledEventId.get(
        Number(started.scheduledEventId ?? 0)
      );
      if (execution) {
        execution.startedMs = eventMs;
        execution.attempt = started.attempt ?? null;
      }
      continue;
    }

    const closed = getActivityClose(event);
    if (closed) {
      const execution = executionsByScheduledEventId.get(
        closed.scheduledEventId
      );
      if (execution) {
        execution.closedMs = eventMs;
        execution.outcome = closed.outcome;
      }
    }
  }

  const executionsByType = new Map<string, ActivityExecution[]>();
  for (const execution of executionsByScheduledEventId.values()) {
    const executions = executionsByType.get(execution.activityType);
    if (executions) {
      executions.push(execution);
    } else {
      executionsByType.set(execution.activityType, [execution]);
    }
  }

  const activityStats = [...executionsByType.entries()].map(
    ([activityType, executions]) => {
      const countOutcome = (outcome: ActivityOutcome) =>
        executions.filter((e) => e.outcome === outcome).length;
      const scheduleToStartMs: number[] = [];
      const startToCloseMs: number[] = [];
      for (const e of executions) {
        if (e.scheduledMs !== null && e.startedMs !== null) {
          scheduleToStartMs.push(e.startedMs - e.scheduledMs);
        }
        if (e.startedMs !== null && e.closedMs !== null) {
          startToCloseMs.push(e.closedMs - e.startedMs);
        }
      }
      return {
        activityType,
        scheduled: executions.length,
        completed: countOutcome("completed"),
        failed: countOutcome("failed"),
        timedOut: countOutcome("timed_out"),
        canceled: countOutcome("canceled"),
        notClosed: executions.filter((e) => e.outcome === null).length,
        maxAttempt: Math.max(0, ...executions.map((e) => e.attempt ?? 0)),
        scheduleToStart: computeDurationStats(scheduleToStartMs),
        startToClose: computeDurationStats(startToCloseMs),
      };
    }
  );

  return {
    workflowTaskFailureCount,
    activityStats,
    omittedEventCount: chronologicalEvents.length - timeline.length,
    timeline,
  };
}
