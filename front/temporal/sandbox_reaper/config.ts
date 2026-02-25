import { EnvironmentConfig } from "@app/types/shared/utils/config";

const QUEUE_VERSION = 1;
export const QUEUE_NAME = `sandbox-reaper-queue-v${QUEUE_VERSION}`;

export const SCHEDULE_ID = "sandbox-reaper-schedule";

export const BATCH_SIZE = 128;

/** Sleep sandboxes that have been inactive for this long. Default: 10 min. */
export const SLEEP_THRESHOLD_MS = Number(
  EnvironmentConfig.getOptionalEnvVariable("SANDBOX_SLEEP_THRESHOLD_MS") ??
    "600000"
);

/** Destroy sandboxes that have been inactive for this long. Default: 24 h. */
export const DESTROY_THRESHOLD_MS = Number(
  EnvironmentConfig.getOptionalEnvVariable("SANDBOX_DESTROY_THRESHOLD_MS") ??
    "86400000"
);
