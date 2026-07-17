const QUEUE_VERSION = 1;
export const QUEUE_NAME = `activation-scheduler-queue-v${QUEUE_VERSION}`;

// Default number of days to wait before nudging the same pod again. Workspaces
// can override this via the `activationNudgeFrequencyCapDays` metadata key.
export const DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS = 2;

// Default number of consecutive unanswered nudges (no user message since the
// nudge fired) after which the scheduler stops nudging a pod. Workspaces can
// override this via the `activationNudgeMaxUnansweredCount` metadata key.
export const DEFAULT_ACTIVATION_NUDGE_MAX_UNANSWERED_COUNT = 3;
