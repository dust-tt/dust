import { EnvironmentConfig } from "@app/types/shared/utils/config";

const QUEUE_VERSION = 1;
export const QUEUE_NAME = `sandbox-reaper-queue-v${QUEUE_VERSION}`;

export const SCHEDULE_ID = "sandbox-reaper-schedule";

export const BATCH_SIZE = 128;

const ONE_MINUTE_MS = 60 * 1_000;
const ONE_HOUR_MS = 60 * ONE_MINUTE_MS;
const ONE_DAY_MS = 24 * ONE_HOUR_MS;

/** Sleep sandboxes that have been inactive for this long. Default: 10 min. */
const sleepThresholdEnv = EnvironmentConfig.getOptionalEnvVariable(
  "SANDBOX_SLEEP_THRESHOLD_MS"
);
export const SLEEP_THRESHOLD_MS = sleepThresholdEnv
  ? Number(sleepThresholdEnv)
  : 10 * ONE_MINUTE_MS;

/** Transition pending_approval sandboxes to sleeping after this long. Default: 30 min. */
const pendingApprovalThresholdEnv = EnvironmentConfig.getOptionalEnvVariable(
  "SANDBOX_PENDING_APPROVAL_THRESHOLD_MS"
);
export const PENDING_APPROVAL_THRESHOLD_MS = pendingApprovalThresholdEnv
  ? Number(pendingApprovalThresholdEnv)
  : 30 * ONE_MINUTE_MS;

/** Destroy sandboxes that have been inactive for this long. Default: 4 days. */
const destroyThresholdEnv = EnvironmentConfig.getOptionalEnvVariable(
  "SANDBOX_DESTROY_THRESHOLD_MS"
);
export const DESTROY_THRESHOLD_MS = destroyThresholdEnv
  ? Number(destroyThresholdEnv)
  : 4 * ONE_DAY_MS;
