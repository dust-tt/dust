import type { ScheduleSpec } from "@temporalio/client";
import { ScheduleOverlapPolicy } from "@temporalio/client";
import type { Duration } from "@temporalio/common";

const WORKFLOW_VERSION = 1;
export const QUEUE_NAME = `gong-v${WORKFLOW_VERSION}`;

export const SCHEDULE_POLICIES: {
  overlap?: ScheduleOverlapPolicy;
  catchupWindow?: Duration;
  pauseOnFailure?: boolean;
} = {
  catchupWindow: "1 day",
  // We buffer up to one workflow to make sure triggering a sync ensures having up-to-date data even if a very
  // long-running workflow was running.
  overlap: ScheduleOverlapPolicy.BUFFER_ONE,
};

export const SCHEDULE_SPEC: ScheduleSpec = {
  // Adding a random offset to avoid all workflows starting at the same time and to take into account the fact
  // that many new transcripts will be made available roughly on the top of the hour.
  jitter: 30 * 60 * 1000, // 30 minutes
  intervals: [{ every: "1h" }],
};
