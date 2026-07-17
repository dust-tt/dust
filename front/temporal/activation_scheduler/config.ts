const QUEUE_VERSION = 1;
export const QUEUE_NAME = `activation-scheduler-queue-v${QUEUE_VERSION}`;

// Default number of days to wait before nudging the same pod again. Workspaces
// can override this via the `activationNudgeFrequencyCapDays` metadata key.
export const DEFAULT_ACTIVATION_NUDGE_FREQUENCY_CAP_DAYS = 2;
