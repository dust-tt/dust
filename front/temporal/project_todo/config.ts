const QUEUE_VERSION = 1;

// TODO: rename this queue
export const QUEUE_NAME = `conversation-todo-queue-v${QUEUE_VERSION}`;

// Throttle for the per-conversation analysis workflow: at most one analysis run
// every 5 minutes, starting immediately on the first signal. Signals that arrive
// during the cool-down are coalesced into the next run.
export const TODO_THROTTLE_MS = 5 * 60 * 1_000;

// The merge workflow (projectMergeWorkflow) calls an LLM to update project todos.
// This throttle prevents more than one LLM merge per project per hour.
export const MERGE_THROTTLE_MS = 60 * 60 * 1_000; // 1 hour
