const QUEUE_VERSION = 1;

// TODO: rename this queue
export const QUEUE_NAME = `conversation-todo-queue-v${QUEUE_VERSION}`;

// The merge workflow (projectMergeWorkflow) calls an LLM to update project todos.
// This throttle prevents more than one LLM merge per project per hour.
export const MERGE_THROTTLE_MS = 60 * 60 * 1_000; // 1 hour
