export const WORKFLOW_VERSION = 8;
export const QUEUE_NAME = `zendesk-queue-v${WORKFLOW_VERSION}`;
export const GARBAGE_COLLECT_QUEUE_NAME = `zendesk-gc-queue-v${WORKFLOW_VERSION}`;

// Batch size used when fetching from Zendesk API or from the database
export const ZENDESK_BATCH_SIZE = 100;
