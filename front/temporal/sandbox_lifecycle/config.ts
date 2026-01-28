const QUEUE_VERSION = 1;

export const QUEUE_NAME = `sandbox-lifecycle-queue-v${QUEUE_VERSION}`;

// Pause sandbox after 20 minutes of inactivity.
export const PAUSE_AFTER_INACTIVITY_MS = 20 * 60 * 1000;

// Destroy sandbox after 7 days of inactivity.
export const DESTROY_AFTER_INACTIVITY_MS = 7 * 24 * 60 * 60 * 1000;
