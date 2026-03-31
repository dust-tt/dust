const QUEUE_VERSION = 1;

export const QUEUE_NAME = `conversation-todo-queue-v${QUEUE_VERSION}`;

// Much longer than the butler debounce (3 s) — we want to wait for a quiet
// window in the conversation before running the heavier todo analysis.
export const TODO_DEBOUNCE_DELAY_MS = 5 * 60 * 1_000;
