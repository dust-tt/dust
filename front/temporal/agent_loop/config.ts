const QUEUE_VERSION = 2;

export const QUEUE_NAME = `agent-loop-queue-v${QUEUE_VERSION}`;

// Max retry attempts for the runModelAndCreateActions activity.
export const RUN_MODEL_MAX_RETRIES = 5;

// Number of attempts that run on the primary model before failing over to the
// workspace backup model (when configured). Attempts beyond this run on the
// backup model, up to RUN_MODEL_MAX_RETRIES. This reuses Temporal's existing
// retry: once the primary has failed RUN_MODEL_PRIMARY_ATTEMPTS times, the next
// retries re-resolve to the backup model.
export const RUN_MODEL_PRIMARY_ATTEMPTS = 3;

// Leave room for our code to surface a retryable agent error before Temporal enforces StartToClose.
export const RUN_MODEL_ACTIVITY_TIMEOUT_SAFETY_MARGIN_MS = 1 * 60 * 1000;

export const TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS = 60 * 1000;
export const MODEL_ACTIVITY_HEARTBEAT_TIMEOUT_MS = 60 * 1000;
