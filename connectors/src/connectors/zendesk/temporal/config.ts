export const WORKFLOW_VERSION = 9;
export const QUEUE_NAME = `zendesk-queue-v${WORKFLOW_VERSION}`;
export const GARBAGE_COLLECT_QUEUE_NAME = `zendesk-gc-queue-v${WORKFLOW_VERSION}`;

// Batch size used when fetching from Zendesk API or from the database
// 100 is the maximum value allowed for most endpoints in Zendesk: https://developer.zendesk.com/api-reference/introduction/pagination/
export const ZENDESK_BATCH_SIZE = 100;
