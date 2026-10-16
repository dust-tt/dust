import logger from "@app/logger/logger";
import type { Info } from "@temporalio/activity";
import type {
  ActivityExecuteInput,
  ActivityInboundCallsInterceptor,
  Next,
} from "@temporalio/worker";

const CHECK_INTERVAL_MS = 1_000;
export const EVENT_LOOP_STALL_THRESHOLD_MS = 5_000;

type ActivityDetails = Record<string, string | number>;

interface TrackedActivity {
  activityType: string;
  workflowId: string;
  activityId: string;
  attempt: number;
  startedAtMs: number;
  endedAtMs: number | null;
  details: ActivityDetails;
}

// Keyed by the attempt's info object rather than activity id: a timed-out attempt can still be
// running locally when its retry (same activity id) starts on this worker.
const inFlightActivities = new Map<Info, TrackedActivity>();
// Activities completed since the last check: a culprit can finish in the same tick that unblocks
// the event loop, before the check runs.
let activitiesCompletedSinceLastCheck: TrackedActivity[] = [];
let stopRunningWatchdog: (() => void) | null = null;

export class StallTrackingActivityInterceptor implements ActivityInboundCallsInterceptor {
  constructor(private readonly info: Info) {}

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    const { activityType, activityId, attempt, workflowExecution } = this.info;
    const activity: TrackedActivity = {
      activityType,
      workflowId: workflowExecution.workflowId,
      activityId,
      attempt,
      startedAtMs: Date.now(),
      endedAtMs: null,
      details: {},
    };
    inFlightActivities.set(this.info, activity);

    try {
      return await next(input);
    } finally {
      inFlightActivities.delete(this.info);
      activity.endedAtMs = Date.now();
      activitiesCompletedSinceLastCheck.push(activity);
    }
  }
}

export function annotateInFlightActivity(
  info: Info,
  details: ActivityDetails
): void {
  const activity = inFlightActivities.get(info);
  if (activity) {
    Object.assign(activity.details, details);
  }
}

function describeActivity(activity: TrackedActivity, nowMs: number) {
  return {
    activityType: activity.activityType,
    workflowId: activity.workflowId,
    activityId: activity.activityId,
    attempt: activity.attempt,
    elapsedMs: (activity.endedAtMs ?? nowMs) - activity.startedAtMs,
    ...activity.details,
  };
}

/**
 * @cc [owner:tdraier,label:logging;performance] stall-reports-activities
 * When the event loop delays a check by at least `EVENT_LOOP_STALL_THRESHOLD_MS`, that check MUST
 * log one "Event loop stalled" warning listing the activities still in flight and those that
 * completed while it was blocked. At most one watchdog runs per process, as they share the tracked
 * activities.
 */
export function startEventLoopStallWatchdog(): () => void {
  if (stopRunningWatchdog) {
    return stopRunningWatchdog;
  }

  let lastCheckMs = Date.now();

  const interval = setInterval(() => {
    const nowMs = Date.now();
    const lagMs = nowMs - lastCheckMs - CHECK_INTERVAL_MS;

    if (lagMs >= EVENT_LOOP_STALL_THRESHOLD_MS) {
      logger.warn(
        {
          lagMs,
          inFlightActivities: Array.from(inFlightActivities.values()).map(
            (activity) => describeActivity(activity, nowMs)
          ),
          activitiesCompletedDuringStall: activitiesCompletedSinceLastCheck.map(
            (activity) => describeActivity(activity, nowMs)
          ),
        },
        "Event loop stalled"
      );
    }

    activitiesCompletedSinceLastCheck = [];
    lastCheckMs = nowMs;
  }, CHECK_INTERVAL_MS);
  interval.unref();

  stopRunningWatchdog = () => {
    clearInterval(interval);
    stopRunningWatchdog = null;
  };
  return stopRunningWatchdog;
}
