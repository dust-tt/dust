const QUEUE_VERSION = 2;

export const QUEUE_NAME = `agent-loop-queue-v${QUEUE_VERSION}`;

// Max retry attempts for the runModelAndCreateActions activity.
export const RUN_MODEL_MAX_RETRIES = 5;

// Leave room for our code to surface a retryable agent error before Temporal enforces StartToClose.
export const RUN_MODEL_ACTIVITY_TIMEOUT_SAFETY_MARGIN_MS = 2 * 60 * 1000;
