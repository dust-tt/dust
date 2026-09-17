import { ONE_DAY_MS } from "@app/types/shared/utils/date_utils";

const QUEUE_VERSION = 2;

export const QUEUE_NAME = `data-retention-queue-v${QUEUE_VERSION}`;

/**
 * Delete Frame function invocations older than this, whether or not their publication is still
 * the active one.
 */
export const FRAME_FUNCTION_INVOCATION_RETENTION_MS = 7 * ONE_DAY_MS;

/** Invocations scanned per activity. Each expired row costs one GCS delete. */
export const FRAME_FUNCTION_INVOCATION_BATCH_SIZE = 200;

export const FRAMES_RETENTION_SCHEDULE_ID = "frames-retention-schedule";
