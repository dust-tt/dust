import { EnvironmentConfig } from "@app/types/shared/utils/config";

const QUEUE_VERSION = 2;

export const QUEUE_NAME = `data-retention-queue-v${QUEUE_VERSION}`;

const ONE_DAY_MS = 24 * 60 * 60 * 1_000;

/**
 * Delete Frame function invocations older than this, whether or not their publication is still
 * the active one. Default: 7 days.
 */
const frameFunctionInvocationRetentionEnv =
  EnvironmentConfig.getOptionalEnvVariable(
    "FRAME_FUNCTION_INVOCATION_RETENTION_MS"
  );
export const FRAME_FUNCTION_INVOCATION_RETENTION_MS =
  frameFunctionInvocationRetentionEnv
    ? Number(frameFunctionInvocationRetentionEnv)
    : 7 * ONE_DAY_MS;

/** Invocations scanned per activity. Each expired row costs one GCS delete. */
export const FRAME_FUNCTION_INVOCATION_BATCH_SIZE = 200;

/**
 * Batches one workflow run may process before it stops and leaves the rest to the next run, so a
 * large backlog cannot keep the activity queue busy indefinitely.
 */
export const FRAME_FUNCTION_INVOCATION_MAX_BATCHES_PER_RUN = 500;

export const FRAMES_RETENTION_SCHEDULE_ID = "frames-retention-schedule";
