import logger from "@app/logger/logger";
import type { Context } from "@temporalio/activity";
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
  startedAtMs: number;
  endedAtMs: number | null;
  details: ActivityDetails;
}

const inFlightActivities = new Map<string, TrackedActivity>();
// Activities completed since the last check: a culprit can finish in the same tick that unblocks
// the event loop, before the check runs.
let activitiesCompletedSinceLastCheck: TrackedActivity[] = [];

function makeActivityKey(workflowId: string, activityId: string): string {
  return `${workflowId}:${activityId}`;
}

export class StallTrackingActivityInterceptor implements ActivityInboundCallsInterceptor {
  constructor(private readonly ctx: Context) {}

  async execute(
    input: ActivityExecuteInput,
    next: Next<ActivityInboundCallsInterceptor, "execute">
  ): Promise<unknown> {
    const { activityType, activityId, workflowExecution } = this.ctx.info;
    const key = makeActivityKey(workflowExecution.workflowId, activityId);
    const activity: TrackedActivity = {
      activityType,
      workflowId: workflowExecution.workflowId,
      activityId,
      startedAtMs: Date.now(),
      endedAtMs: null,
      details: {},
    };
    inFlightActivities.set(key, activity);

    try {
      return await next(input);
    } finally {
      inFlightActivities.delete(key);
      activity.endedAtMs = Date.now();
      activitiesCompletedSinceLastCheck.push(activity);
    }
  }
}

export function annotateInFlightActivity(
  {
    workflowId,
    activityId,
  }: {
    workflowId: string;
    activityId: string;
  },
  details: ActivityDetails
): void {
  const activity = inFlightActivities.get(
    makeActivityKey(workflowId, activityId)
  );
  if (activity) {
    Object.assign(activity.details, details);
  }
}

function describeActivity(activity: TrackedActivity, nowMs: number) {
  return {
    activityType: activity.activityType,
    workflowId: activity.workflowId,
    activityId: activity.activityId,
    elapsedMs: (activity.endedAtMs ?? nowMs) - activity.startedAtMs,
    ...activity.details,
  };
}

/**
 * @cc [owner:tdraier,label:logging;performance] stall-reports-activities
 * When the event loop is blocked for at least `EVENT_LOOP_STALL_THRESHOLD_MS`, the next check MUST
 * log one "Event loop stalled" warning listing the activities still in flight and those that
 * completed while it was blocked.
 */
export function startEventLoopStallWatchdog(): () => void {
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

  return () => clearInterval(interval);
}
