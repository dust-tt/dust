const QUEUE_VERSION = 2;

export const QUEUE_NAME = `agent-loop-queue-v${QUEUE_VERSION}`;

// Max retry attempts for the runModelAndCreateActions activity.
export const RUN_MODEL_MAX_RETRIES = 5;

// Leave room for our code to surface a retryable agent error before Temporal enforces StartToClose.
export const RUN_MODEL_ACTIVITY_TIMEOUT_SAFETY_MARGIN_MS = 1 * 60 * 1000;

export const TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS = 60 * 1000;
export const MODEL_ACTIVITY_HEARTBEAT_TIMEOUT_MS = 60 * 1000;

// Heartbeat cadence while tool result processing runs (file handling can take minutes): fire
// comfortably within the heartbeat timeout.
const TOOL_RESULT_PROCESSING_HEARTBEAT_TIMEOUT_MARGIN_MS = 5 * 1000;
export const TOOL_RESULT_PROCESSING_HEARTBEAT_INTERVAL_MS =
  TOOL_ACTIVITY_HEARTBEAT_TIMEOUT_MS -
  TOOL_RESULT_PROCESSING_HEARTBEAT_TIMEOUT_MARGIN_MS;
