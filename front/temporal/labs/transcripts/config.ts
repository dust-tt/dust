import type { ScheduleSpec } from "@temporalio/client";
import { ScheduleOverlapPolicy } from "@temporalio/client";
import type { Duration } from "@temporalio/common";

const QUEUE_VERSION = 2;

export const TRANSCRIPTS_QUEUE_NAME = `labs-transcripts-queue-v${QUEUE_VERSION}`;

export const TRANSCRIPTS_SCHEDULE_POLICIES: {
  overlap?: ScheduleOverlapPolicy;
  catchupWindow?: Duration;
  pauseOnFailure?: boolean;
} = {
  // Skip overlapping executions since we process all available transcripts in each run
  overlap: ScheduleOverlapPolicy.SKIP,
  catchupWindow: "1 day",
  pauseOnFailure: false, // Continue processing even if individual transcripts fail
};

export const TRANSCRIPTS_SCHEDULE_SPEC: ScheduleSpec = {
  // Every 5 minutes, with some jitter to avoid all configurations running at the same time
  intervals: [{ every: "5m" }],
  jitter: "1m", // Add 1 minute of randomness
};
